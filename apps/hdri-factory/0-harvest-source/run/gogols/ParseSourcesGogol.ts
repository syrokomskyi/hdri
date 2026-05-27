/*
<MODULE_CONTRACT>
<purpose>Orchestrates the extraction of business data from various source files (catalogs, website databases, etc.).</purpose>
<keywords>parsing, sources, data extraction, harvest, sqlite, parallel, transaction</keywords>
<responsibilities>
  <item>Iterates through batches and source files to extract business seeds.</item>
  <item>Delegates specific parsing logic to source-specific parsers via a registry.</item>
  <item>Manages database persistence for discovered sites and source seeds using parallel workers.</item>
  <item>Optimizes database performance through batched transactions.</item>
  <item>Generates detailed execution reports in Markdown, JSON, and CSV formats.</item>
</responsibilities>
<non-goals>
  <item>Do not implement low-level HTML/CSV parsing logic directly.</item>
  <item>Do not manage browser-based harvesting.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ParseSourcesGogol">The main gogol class for orchestrating the parsing process.</entry>
  <entry key="upsertSite">Helper for managing site records in the database.</entry>
  <entry key="upsertSourceSeed">Helper for managing source seed records in the database.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Refactor parsing architecture to use catalog-specific independent parsers via a registry.</item>
  <item>Support skipping files marked as 'ignored' by the parser to reduce log noise.</item>
  <item>Implement parallel parsing with ConcurrencyGate and batched SQLite transactions for radical speedup.</item>
  <item>Add GRACE scaffolding to define module responsibilities.</item>
  <item>Add per-batch CSV artifacts: sources.csv, sites-registered.csv, seeds-skipped.csv.</item>
  <item>Add skipSummary aggregation by source in report.json and report.md.</item>
  <item>Implement database-backed resume logic: skip parsing if source_file_stats exists for the batch.</item>
  <item>Confirm batch artifacts are written even when all files are resumed (no-op scenario).</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package for proper formatting and alignment.</item>
  <item>Restructure batch statistics to show each batch as a column with "Total" as the first column for better cross-batch comparison.</item>
  <item>Change report grouping from batch name to source (first folder inside batch) for meaningful column breakdown by data source.</item>
  <item>Add progress log for ignored files so the counter visibly reaches totalFiles and operators know the pipeline did not hang.</item>
  <item>Print per-batch file completion count after Promise.all resolves for clearer end-of-batch visibility.</item>
  <item>Fix markdown table alignment array — remove extra 'r' element causing misaligned column headers.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed harvestYear field.</item>
  <item>Implement maxCountSitePerSourceFolder as a site limit per folder in ParseSourcesGogol; remove incorrect file-level filter from source-files.ts.</item>
  <item>Replace maxSites with maxPages: maxPages limits total source files parsed across batches. Remove limit_reached skip reason, globalSitesCounter, and atomics logic. Apply slice before map to avoid useless Promise overhead.</item>
  <item>Expose no_url skipped count in final console summary alongside no_url_warnings for transparent arithmetic.</item>
  <item>Remove per-batch detailed source-files table from report.md; reference batches/&lt;name&gt;/sources.csv instead.</item>
  <item>Remove per-page console.log output in favor of logProgress from @org/utils, which reports every 1000 pages.</item>
  <item>Fix report.md skip count discrepancy by adding per-file skip reason breakdown (noUrl, badUrl, stopDomain) to SourceFileStat and aggregating exactly instead of proportional distribution.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import { stringify as csvStringify } from 'csv-stringify/sync';
import path from 'node:path';
import Database from 'better-sqlite3';
import { markdownTable } from 'markdown-table';
import { normaliseDomain, isStopDomain } from '@org/business-core/ids';
import { ConcurrencyGate } from '@org/business-rate-limit';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { parseSourceToken } from '@org/observatory-crypto';
import { listBatchSourceFiles } from '../source-files.js';
import { getParserForSource } from '../parsers/index.js';
import type { SourceBusinessSeed } from '../source-records.js';
import { openCoreSqlite } from '../db/connection.js';
import { getDbDir } from '../paths.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkipReason = 'no_url' | 'bad_url' | 'stop_domain';

type SourceFileStat = {
  path: string;
  type: string;
  itemsParsed: number;
  itemsRegistered: number;
  itemsSkipped: number;
  noUrl: number;
  badUrl: number;
  stopDomain: number;
};

type SkipSummary = {
  noUrl: number;
  badUrl: number;
  stopDomain: number;
};

type BatchReport = {
  batchName: string;
  sourceFiles: SourceFileStat[];
  /** Parser-level items that had no URL at all (not counted in skipped). */
  noUrlWarnings: number;
  skipSummary: SkipSummary;
  /** Free-form warning strings accumulated during batch processing. */
  warnings: string[];
};

type FileResult = {
  stat: SourceFileStat;
  noUrlWarnings: number;
  skipSummary: SkipSummary;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a source file, detecting its character encoding for HTML files.
 *
 * Some scraped sites (e.g. branchenverzeichnis.org) serve ISO-8859-1 / Windows-1252
 * even though the file extension is .html — reading them as UTF-8 corrupts umlauts
 * (e.g. "Görlitz" → "G�rlitz"). We sniff the <meta charset> declaration in the first
 * 2 KB and decode accordingly. CSV inputs are assumed to be UTF-8.
 */
const readSourceFile = async (absolutePath: string, ext: string): Promise<string> => {
  if (ext !== '.html' && ext !== '.htm' && ext !== '.mhtml') {
    return fs.readFile(absolutePath, 'utf-8');
  }

  const buf = await fs.readFile(absolutePath);
  // Sniff first 2 KB as latin1 (lossless byte-preserving) to find the meta charset.
  const head = buf.slice(0, Math.min(buf.length, 2048)).toString('latin1').toLowerCase();

  let charset = 'utf-8';
  const m =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_:-]+)/i) ??
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([a-z0-9_:-]+)/i);
  if (m && m[1]) charset = m[1].toLowerCase();

  // Map legacy aliases to TextDecoder-recognized labels.
  if (charset === 'iso-8859-1' || charset === 'latin1' || charset === 'latin-1') {
    charset = 'windows-1252'; // browsers treat 8859-1 as cp1252; matches what scrapers fetched
  }

  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    // Unknown label — fall back to UTF-8.
    return buf.toString('utf-8');
  }
};


const renderReportMd = (
  batches: BatchReport[],
  maxPages: number,
  doneAt: string,
): string => {
  const lines: string[] = [
    `# Parse Sources — Report`,
    ``,
    `**Harvest batch ID:** harvest  `,
    `**Completed:** ${doneAt}  `,
    `**maxPages:** ${maxPages < 0 ? 'unlimited' : maxPages}`,
    ``,
  ];

  // Group statistics by source (first folder inside batch) instead of by batch
  const sourceStats = new Map<string, {
    sourceFiles: number;
    itemsParsed: number;
    noUrlWarnings: number;
    itemsRegistered: number;
    badUrl: number;
    stopDomain: number;
    noUrl: number;
  }>();

  for (const batch of batches) {
    for (const file of batch.sourceFiles) {
      // Extract source from batchScopedPath: "2026-04/branchenverzeichnis.org/..."
      const source = file.path.split('/')[1] ?? 'unknown';
      const existing = sourceStats.get(source);
      if (existing) {
        existing.sourceFiles++;
        existing.itemsParsed += file.itemsParsed;
        existing.itemsRegistered += file.itemsRegistered;
        existing.noUrl += file.noUrl;
        existing.badUrl += file.badUrl;
        existing.stopDomain += file.stopDomain;
      } else {
        sourceStats.set(source, {
          sourceFiles: 1,
          itemsParsed: file.itemsParsed,
          noUrlWarnings: 0,
          itemsRegistered: file.itemsRegistered,
          badUrl: file.badUrl,
          stopDomain: file.stopDomain,
          noUrl: file.noUrl,
        });
      }
    }
  }

  const sortedSources = Array.from(sourceStats.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Calculate totals
  const totalSourceFiles = batches.reduce((sum, b) => sum + b.sourceFiles.length, 0);
  const totalParsed = batches.reduce((sum, b) => sum + b.sourceFiles.reduce((s, f) => s + f.itemsParsed, 0), 0);
  const totalNoUrlWarnings = batches.reduce((sum, b) => sum + b.noUrlWarnings, 0);
  const totalRegistered = batches.reduce((sum, b) => sum + b.sourceFiles.reduce((s, f) => s + f.itemsRegistered, 0), 0);
  const totalBadUrl = batches.reduce((sum, b) => sum + b.skipSummary.badUrl, 0);
  const totalStopDomain = batches.reduce((sum, b) => sum + b.skipSummary.stopDomain, 0);
  const totalNoUrl = batches.reduce((sum, b) => sum + b.skipSummary.noUrl, 0);
  const totalSkipped = totalNoUrl + totalBadUrl + totalStopDomain;

  // Create source statistics table with each source as a column
  const sourceHeaders = ['Total', ...sortedSources.map(([name]) => name)];
  const batchStatsTable: string[][] = [sourceHeaders];

  // Add rows for each metric
  batchStatsTable.push(['Source files processed', String(totalSourceFiles), ...sortedSources.map(([, s]) => String(s.sourceFiles))]);
  batchStatsTable.push(['Items with URL (parsed)', String(totalParsed), ...sortedSources.map(([, s]) => String(s.itemsParsed))]);
  batchStatsTable.push(['Items without URL (ignored by parser)', String(totalNoUrlWarnings), ...sortedSources.map(([, s]) => String(s.noUrlWarnings))]);
  batchStatsTable.push(['Sites registered', String(totalRegistered), ...sortedSources.map(([, s]) => String(s.itemsRegistered))]);
  batchStatsTable.push(['Skipped — bad URL', String(totalBadUrl), ...sortedSources.map(([, s]) => String(s.badUrl))]);
  batchStatsTable.push(['Skipped — stop domain', String(totalStopDomain), ...sortedSources.map(([, s]) => String(s.stopDomain))]);
  batchStatsTable.push(['Skipped — total', String(totalSkipped), ...sortedSources.map(([, s]) => String(s.noUrl + s.badUrl + s.stopDomain))]);

  lines.push(
    `## Batch`,
    ``,
    markdownTable(batchStatsTable, { align: ['l', ...sortedSources.map(() => 'r')] }),
    ``,
    `> **maxPages** limits the number of source files (pages) parsed per run.`,
    `> Raise \`maxPages\` to parse more source files.`,
    ``,
  );

  // Per-batch details are intentionally omitted from report.md;
  // the detailed source-file breakdown is available in
  // batches/<name>/sources.csv for each batch.
  for (const b of batches) {
    lines.push(
      `## Batch: ${b.batchName}`,
      ``,
      `See \`batches/${b.batchName}/sources.csv\` for the detailed file-level breakdown.`,
      ``,
    );
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const upsertSite = (
  db: Database.Database,
  domain: string,
): number => {
  db.prepare(`
    INSERT INTO sites (domain)
    VALUES (?)
    ON CONFLICT(domain) DO NOTHING
  `).run(domain);

  const row = db.prepare('SELECT id FROM sites WHERE domain = ?').get(domain) as { id: number };
  return row.id;
};

const upsertSourceSeed = (
  db: Database.Database,
  siteId: number,
  sourcePath: string,
  item: SourceBusinessSeed,
): void => {
  db.prepare(`
    INSERT INTO site_source_seeds (
      site_id, source_path, source_item_key,
      business_name, street_address, postal_code, city, phone, email,
      website_url, category, source_profile_url, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, source_path, source_item_key) DO NOTHING
  `).run(
    siteId,
    sourcePath,
    item.sourceItemKey,
    item.businessName,
    item.streetAddress,
    item.postalCode,
    item.city,
    item.phone,
    item.email,
    item.websiteUrl,
    item.category,
    item.sourceProfileUrl,
    JSON.stringify(item.raw),
  );
};

const insertSkippedSeed = (
  db: Database.Database,
  sourcePath: string,
  item: SourceBusinessSeed,
  reason: SkipReason,
): void => {
  db.prepare(`
    INSERT INTO skipped_source_seeds (
      source_path, item_key, business_name, raw_url, reason
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_path, item_key) DO NOTHING
  `).run(
    sourcePath,
    item.sourceItemKey,
    item.businessName,
    item.websiteUrl,
    reason,
  );
};

const upsertFileStat = (
  db: Database.Database,
  stat: SourceFileStat,
  noUrlWarnings: number,
  ss: SkipSummary,
): void => {
  db.prepare(`
    INSERT INTO source_file_stats (
      source_path, items_parsed, items_registered, items_skipped,
      no_url_warnings, no_url, bad_url, stop_domain
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      items_parsed = excluded.items_parsed,
      items_registered = excluded.items_registered,
      items_skipped = excluded.items_skipped,
      no_url_warnings = excluded.no_url_warnings,
      no_url = excluded.no_url,
      bad_url = excluded.bad_url,
      stop_domain = excluded.stop_domain
  `).run(
    stat.path,
    stat.itemsParsed,
    stat.itemsRegistered,
    stat.itemsSkipped,
    noUrlWarnings,
    ss.noUrl,
    ss.badUrl,
    ss.stopDomain,
  );
};

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class ParseSourcesGogol extends Gogol {
  override readonly id = 'parse-sources';

  override async run(ctx: PipelineContext): Promise<void> {
    const { batchNames, brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const maxPages = brief.maxPages;
    const concurrency = brief.parserConcurrency;

    await fs.mkdir(getDbDir(), { recursive: true });
    const db = openCoreSqlite(year);

    console.log(`[parse-sources] maxPages: ${maxPages < 0 ? 'unlimited' : maxPages}`);

    // Ensure local progress tracking tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS source_file_stats (
        source_path        TEXT NOT NULL PRIMARY KEY,
        items_parsed       INTEGER NOT NULL,
        items_registered   INTEGER NOT NULL,
        items_skipped      INTEGER NOT NULL,
        no_url_warnings    INTEGER NOT NULL,
        no_url             INTEGER NOT NULL,
        bad_url            INTEGER NOT NULL,
        stop_domain        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skipped_source_seeds (
        source_path        TEXT NOT NULL,
        item_key           TEXT NOT NULL,
        business_name      TEXT,
        raw_url            TEXT,
        reason             TEXT NOT NULL,
        PRIMARY KEY (source_path, item_key)
      );
    `);

    const outDir = ctx.getGogolOutputDir(this.id);
    const doneAt = new Date().toISOString();
    const allBatchReports: BatchReport[] = [];
    let pagesProcessed = 0;

    const gate = new ConcurrencyGate(concurrency);

    for (const batchName of batchNames) {
      console.log(`[parse-sources] Processing batch: ${batchName} (concurrency: ${concurrency})`);

      const allSourceFiles = await listBatchSourceFiles(batchName, brief);

      // Pre-filter: exclude files already processed in previous runs
      // This avoids I/O overhead from reading and checking already-processed files
      const processedPaths = new Set(
        db.prepare(`
          SELECT source_path FROM source_file_stats
        `).pluck().all() as string[]
      );
      let sourceFiles = allSourceFiles.filter(sf => !processedPaths.has(sf.batchScopedPath));

      // Apply maxPages slice across all batches (cumulative)
      if (maxPages >= 0) {
        const remaining = maxPages - pagesProcessed;
        if (remaining <= 0) {
          console.log(`[parse-sources] maxPages (${maxPages}) reached. Stopping further batches.`);
          break;
        }
        sourceFiles = sourceFiles.slice(0, remaining);
      }

      if (processedPaths.size > 0) {
        console.log(`  Found ${allSourceFiles.length} source file(s), ${processedPaths.size} already processed, ${sourceFiles.length} remaining`);
      } else {
        console.log(`  Found ${sourceFiles.length} source file(s)`);
      }

      const batchReport: BatchReport = {
        batchName,
        sourceFiles: [],
        noUrlWarnings: 0,
        skipSummary: { noUrl: 0, badUrl: 0, stopDomain: 0 },
        warnings: [],
      };

      let filesFinished = 0;
      const totalFiles = sourceFiles.length;

      const filePromises = sourceFiles.map((sf) =>
        gate.run(async (): Promise<FileResult | null> => {
          const ext = sf.extension;
          const sourceId = sf.relativeDir === '.' ? '__batch_root__' : sf.relativeDir;

          const content = await readSourceFile(sf.absolutePath, ext);
          const parser = getParserForSource(sourceId);

          const parseResult = parser.parse(content, sf.logicalPath);

          if (parseResult.parserKind.endsWith('-ignored')) {
            filesFinished++;
            logProgress(this.id, filesFinished, totalFiles, 1000, true);
            return null;
          }

          const fileSkipSummary = { noUrl: 0, badUrl: 0, stopDomain: 0 };
          let noUrlInFile = 0;

          // Count parser-level "no URL" items
          noUrlInFile = parseResult.warnings.filter(
            (w) => w.includes('no website URL') || w.includes('no homepage URL'),
          ).length;

          let countThisFile = 0;
          let skippedThisFile = 0;

          // Wrap database operations in a single transaction per file for massive speedup
          db.transaction(() => {
            for (const item of parseResult.items) {
              // First: all validation without side effects
              if (!item.websiteUrl) {
                insertSkippedSeed(db, sf.batchScopedPath, item, 'no_url');
                fileSkipSummary.noUrl++;
                skippedThisFile++;
                continue;
              }

              const domain = normaliseDomain(item.websiteUrl);
              if (!domain) {
                insertSkippedSeed(db, sf.batchScopedPath, item, 'bad_url');
                fileSkipSummary.badUrl++;
                skippedThisFile++;
                continue;
              }

              if (isStopDomain(domain)) {
                insertSkippedSeed(db, sf.batchScopedPath, item, 'stop_domain');
                fileSkipSummary.stopDomain++;
                skippedThisFile++;
                continue;
              }

              const siteId = upsertSite(db, domain);
              upsertSourceSeed(db, siteId, sf.batchScopedPath, item);

              countThisFile++;
            }

            const stat = {
              path: sf.batchScopedPath,
              type: ext.replace('.', ''),
              itemsParsed: parseResult.items.length,
              itemsRegistered: countThisFile,
              itemsSkipped: skippedThisFile,
              noUrl: fileSkipSummary.noUrl,
              badUrl: fileSkipSummary.badUrl,
              stopDomain: fileSkipSummary.stopDomain,
            };

            upsertFileStat(db, stat, noUrlInFile, fileSkipSummary);
          })();

          const result = {
            stat: {
              path: sf.batchScopedPath,
              type: ext.replace('.', ''),
              itemsParsed: parseResult.items.length,
              itemsRegistered: countThisFile,
              itemsSkipped: skippedThisFile,
              noUrl: fileSkipSummary.noUrl,
              badUrl: fileSkipSummary.badUrl,
              stopDomain: fileSkipSummary.stopDomain,
            },
            noUrlWarnings: noUrlInFile,
            skipSummary: fileSkipSummary,
          };

          filesFinished++;
          logProgress(this.id, filesFinished, totalFiles, 1000, true);

          return result;
        }),
      );

      const fileResults = await Promise.all(filePromises);

      for (const res of fileResults) {
        if (!res) continue;

        batchReport.sourceFiles.push(res.stat);
        batchReport.noUrlWarnings += res.noUrlWarnings;
        batchReport.skipSummary.noUrl += res.skipSummary.noUrl;
        batchReport.skipSummary.badUrl += res.skipSummary.badUrl;
        batchReport.skipSummary.stopDomain += res.skipSummary.stopDomain;
      }

      allBatchReports.push(batchReport);
      pagesProcessed += sourceFiles.length;

      console.log(
        `[parse-sources] Batch ${batchName} done: ${batchReport.sourceFiles.length} source files processed`,
      );

      // Per-batch CSVs
      const batchOutDir = path.join(outDir, 'batches', batchName);
      await ctx.writeTextFile(
        path.join(batchOutDir, 'sources.csv'),
        csvStringify([
          ['file', 'type', 'items_parsed', 'items_registered', 'items_skipped', 'no_url', 'bad_url', 'stop_domain'],
          ...batchReport.sourceFiles.map((f) => [f.path, f.type, f.itemsParsed, f.itemsRegistered, f.itemsSkipped, f.noUrl, f.badUrl, f.stopDomain]),
        ]),
      );

      // 2. sites-registered.csv (query from DB to save memory)
      const registeredRows = Array.from(
        db.prepare(`
          SELECT s.domain, sss.business_name, sss.city, sss.category, sss.website_url, sss.source_path
          FROM site_source_seeds sss
          JOIN sites s ON sss.site_id = s.id
          WHERE sss.source_path LIKE ?
        `).iterate(`${batchName}/%`) as any,
      ).map((r: any) => [r.domain, r.business_name, r.city, r.category, r.website_url, r.source_path]);
      await ctx.writeTextFile(
        path.join(batchOutDir, 'sites-registered.csv'),
        csvStringify([
          ['domain', 'business_name', 'city', 'category', 'website_url', 'source_file'],
          ...registeredRows,
        ]),
      );

      // 3. seeds-skipped.csv (query from DB to save memory)
      const skippedRows = Array.from(
        db.prepare(`
          SELECT source_path, item_key, business_name, raw_url, reason
          FROM skipped_source_seeds WHERE source_path LIKE ?
        `).iterate(`${batchName}/%`) as any,
      ).map((s: any) => [s.source_path, s.item_key, s.business_name, s.raw_url, s.reason]);
      await ctx.writeTextFile(
        path.join(batchOutDir, 'seeds-skipped.csv'),
        csvStringify([
          ['source_file', 'item_key', 'business_name', 'raw_url', 'reason'],
          ...skippedRows,
        ]),
      );

      if (batchReport.warnings.length > 0) {
        await ctx.writeTextFile(
          path.join(batchOutDir, 'warnings.txt'),
          batchReport.warnings.join('\n'),
        );
      }
    }

    db.close();

    await ctx.writeTextFile(
      path.join(outDir, 'report.md'),
      renderReportMd(allBatchReports, maxPages, doneAt),
    );

    const totalRegistered = allBatchReports.reduce((sum, b) => {
      const batchRegistered = b.sourceFiles.reduce((s, f) => s + f.itemsRegistered, 0);
      return sum + batchRegistered;
    }, 0);

    await ctx.writeTextFile(
      path.join(outDir, 'report.json'),
      JSON.stringify(
        {
          doneAt,
          maxPages,
          totalSitesRegistered: totalRegistered,
          batches: allBatchReports.map((b) => ({
            batchName: b.batchName,
            sourceFilesCount: b.sourceFiles.length,
            sitesRegistered: b.sourceFiles.reduce((s, f) => s + f.itemsRegistered, 0),
            noUrlInSource: b.noUrlWarnings,
            skipSummary: b.skipSummary,
          })),
        },
        null,
        2,
      ),
    );

    const totalSkipped = allBatchReports.reduce(
      (sum, b) => sum + b.skipSummary.noUrl + b.skipSummary.badUrl + b.skipSummary.stopDomain,
      0,
    );
    const totalNoUrl = allBatchReports.reduce((sum, b) => sum + b.noUrlWarnings, 0);

    const totalNoUrlSkipped = allBatchReports.reduce((s, b) => s + b.skipSummary.noUrl, 0);

    console.log(
      `[parse-sources] Done.` +
      ` registered=${totalRegistered}` +
      ` no_url=${totalNoUrlSkipped}` +
      ` no_url_warnings=${totalNoUrl}` +
      ` bad_url=${allBatchReports.reduce((s, b) => s + b.skipSummary.badUrl, 0)}` +
      ` stop_domain=${allBatchReports.reduce((s, b) => s + b.skipSummary.stopDomain, 0)}` +
      ` total_skipped=${totalSkipped}`,
    );
  }
}
