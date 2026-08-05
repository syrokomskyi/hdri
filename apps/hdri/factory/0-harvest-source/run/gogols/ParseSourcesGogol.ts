/*
<MODULE_CONTRACT>
<purpose>Orchestrates the extraction of business data from various source files (catalogs, website databases, etc.).</purpose>
<non-goals>
  <item>Do not implement low-level HTML/CSV parsing logic directly.</item>
  <item>Do not manage browser-based harvesting.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Publish period-scoped frame projections only after their immutable signed guard succeeds.</item>
  <item>Refactor parsing architecture to use catalog-specific independent parsers via a registry.</item>
  <item>Support skipping files marked as 'ignored' by the parser to reduce log noise.</item>
  <item>Implement parallel parsing with ConcurrencyGate and batched SQLite transactions for radical speedup.</item>
  <item>Add COMPASS scaffolding to define module responsibilities.</item>
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
  <item>Remove per-page console.log output in favor of logProgress from @syrokomskyi/utils, which reports every 1000 pages.</item>
  <item>Fix report.md skip count discrepancy by adding per-file skip reason breakdown (noUrl, badUrl, stopDomain) to SourceFileStat and aggregating exactly instead of proportional distribution.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Migrate shared concurrency primitive import from @syrokomskyi/business-rate-limit to @syrokomskyi/rate-limit.</item>
  <item>File-size refactor: extracted domain types, DB helpers, and report/source-file helpers into separate modules; gogol class now focuses on orchestration.</item>
  <item>Seal accepted batches and ledger-bound frame manifests with Ed25519 signatures.</item>
  <item>Add empty-quarter fail-fast guard (RFC-0068): check site count before materializeLedgerProjection.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { stringify as csvStringify } from "csv-stringify/sync";
import path from "node:path";
import { normaliseDomain, isStopDomain } from "@syrokomskyi/business-core/ids";
import { ConcurrencyGate } from "@syrokomskyi/rate-limit";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import {
  getTransparencyKeysDir,
  loadVerificationKeys,
  parseSourceToken,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import {
  checkSourceBatch,
  freezeFrame,
  publishFrozenFrameProjection,
  readSourceBatchManifests,
  rebuildLedgerHead,
  sealSourceBatch,
  sourceOccurrenceId,
  type HdriPeriod,
  type ProvisionalAssetId,
  type SourceBatchManifest,
} from "@syrokomskyi/factory-core";
import { deriveAssetId } from "@syrokomskyi/observatory-core";
import { listBatchSourceFiles } from "../source-files.js";
import { getParserForSource } from "../parsers/index.js";
import { openCoreSqlite } from "../db/connection.js";
import { getDbDir } from "../paths.js";
import { outputRootDir } from "../config.js";
import {
  insertSkippedSeed,
  upsertFileStat,
  upsertSite,
  upsertSourceSeed,
} from "./parse-sources-db.js";
import { accumulateFileResult, readSourceFile, renderReportMd } from "./parse-sources-report.js";
import type { BatchReport, FileResult } from "./parse-sources-types.js";
import { checkMinSitesGuard } from "./check-min-sites-guard.js";

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class ParseSourcesGogol extends Gogol {
  override readonly id = "parse-sources";

  override async run(ctx: PipelineContext): Promise<void> {
    const { batchNames, brief } = ctx.state;
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const currentPeriod = `${year}-q${quarter}` as HdriPeriod;
    const maxPages = brief.maxPages;
    const concurrency = brief.parserConcurrency;
    const verificationKeys = await loadVerificationKeys(getTransparencyKeysDir());

    await fs.mkdir(getDbDir(), { recursive: true });
    const db = openCoreSqlite(year);

    console.log(`[parse-sources] maxPages: ${maxPages < 0 ? "unlimited" : maxPages}`);

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
      const sourceManifest = await buildSourceBatchManifest(
        batchName,
        allSourceFiles,
        currentPeriod,
      );
      const ledgerDir = path.join(outputRootDir, "data", "source-ledger");
      await checkSourceBatch(ledgerDir, sourceManifest, verificationKeys);

      // Pre-filter: exclude files already processed in previous runs
      // This avoids I/O overhead from reading and checking already-processed files
      const processedPaths = new Set(
        db
          .prepare(
            `
          SELECT source_path FROM source_file_stats
        `,
          )
          .pluck()
          .all() as string[],
      );
      let sourceFiles = allSourceFiles.filter((sf) => !processedPaths.has(sf.batchScopedPath));

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
        console.log(
          `  Found ${allSourceFiles.length} source file(s), ${processedPaths.size} already processed, ${sourceFiles.length} remaining`,
        );
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
          const sourceId = sf.relativeDir === "." ? "__batch_root__" : sf.relativeDir;

          const content = await readSourceFile(sf.absolutePath, ext);
          const parser = getParserForSource(sourceId);

          const parseResult = parser.parse(content, sf.logicalPath);

          if (parseResult.parserKind.endsWith("-ignored")) {
            filesFinished++;
            logProgress(this.id, filesFinished, totalFiles, 1000, true);
            return null;
          }

          const fileSkipSummary = { noUrl: 0, badUrl: 0, stopDomain: 0 };
          let noUrlInFile = 0;

          // Count parser-level "no URL" items
          noUrlInFile = parseResult.warnings.filter(
            (w) => w.includes("no website URL") || w.includes("no homepage URL"),
          ).length;

          let countThisFile = 0;
          let skippedThisFile = 0;

          // Wrap database operations in a single transaction per file for massive speedup
          db.transaction(() => {
            for (const item of parseResult.items) {
              // First: all validation without side effects
              if (!item.websiteUrl) {
                insertSkippedSeed(db, sf.batchScopedPath, item, "no_url");
                fileSkipSummary.noUrl++;
                skippedThisFile++;
                continue;
              }

              const domain = normaliseDomain(item.websiteUrl);
              if (!domain) {
                insertSkippedSeed(db, sf.batchScopedPath, item, "bad_url");
                fileSkipSummary.badUrl++;
                skippedThisFile++;
                continue;
              }

              if (isStopDomain(domain)) {
                insertSkippedSeed(db, sf.batchScopedPath, item, "stop_domain");
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
              type: ext.replace(".", ""),
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
              type: ext.replace(".", ""),
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

        accumulateFileResult(batchReport, res);
      }

      allBatchReports.push(batchReport);
      pagesProcessed += sourceFiles.length;

      console.log(
        `[parse-sources] Batch ${batchName} done: ${batchReport.sourceFiles.length} source files processed`,
      );

      const batchOutDir = path.join(outDir, "batches", batchName);
      if (maxPages < 0) {
        const sealResult = await sealSourceBatch(
          ledgerDir,
          sourceManifest,
          undefined,
          verificationKeys,
        );
        const ledgerHead = await rebuildLedgerHead(ledgerDir);
        await ctx.writeTextFile(
          path.join(batchOutDir, "source-batch-manifest.json"),
          `${JSON.stringify({ ...sourceManifest, sealResult, ledgerHead }, null, 2)}\n`,
        );
      }

      // Per-batch CSVs
      await ctx.writeTextFile(
        path.join(batchOutDir, "sources.csv"),
        csvStringify([
          [
            "file",
            "type",
            "items_parsed",
            "items_registered",
            "items_skipped",
            "no_url",
            "bad_url",
            "stop_domain",
          ],
          ...batchReport.sourceFiles.map((f) => [
            f.path,
            f.type,
            f.itemsParsed,
            f.itemsRegistered,
            f.itemsSkipped,
            f.noUrl,
            f.badUrl,
            f.stopDomain,
          ]),
        ]),
      );

      // 2. sites-registered.csv (query from DB to save memory)
      const registeredRows = Array.from(
        db
          .prepare(
            `
          SELECT s.domain, sss.business_name, sss.city, sss.category, sss.website_url, sss.source_path
          FROM site_source_seeds sss
          JOIN sites s ON sss.site_id = s.id
          WHERE sss.source_path LIKE ?
        `,
          )
          .iterate(`${batchName}/%`) as any,
      ).map((r: any) => [
        r.domain,
        r.business_name,
        r.city,
        r.category,
        r.website_url,
        r.source_path,
      ]);
      await ctx.writeTextFile(
        path.join(batchOutDir, "sites-registered.csv"),
        csvStringify([
          ["domain", "business_name", "city", "category", "website_url", "source_file"],
          ...registeredRows,
        ]),
      );

      // 3. seeds-skipped.csv (query from DB to save memory)
      const skippedRows = Array.from(
        db
          .prepare(
            `
          SELECT source_path, item_key, business_name, raw_url, reason
          FROM skipped_source_seeds WHERE source_path LIKE ?
        `,
          )
          .iterate(`${batchName}/%`) as any,
      ).map((s: any) => [s.source_path, s.item_key, s.business_name, s.raw_url, s.reason]);
      await ctx.writeTextFile(
        path.join(batchOutDir, "seeds-skipped.csv"),
        csvStringify([
          ["source_file", "item_key", "business_name", "raw_url", "reason"],
          ...skippedRows,
        ]),
      );

      if (batchReport.warnings.length > 0) {
        await ctx.writeTextFile(
          path.join(batchOutDir, "warnings.txt"),
          batchReport.warnings.join("\n"),
        );
      }
    }

    if (maxPages < 0) {
      checkMinSitesGuard(db, brief.minSitesThreshold, maxPages);
      await materializeLedgerProjection(
        db,
        path.join(outputRootDir, "data", "source-ledger"),
        brief.sourceToken,
        batchNames,
        verificationKeys,
      );
    }
    db.close();

    await ctx.writeTextFile(
      path.join(outDir, "report.md"),
      renderReportMd(allBatchReports, maxPages, doneAt),
    );

    const totalRegistered = allBatchReports.reduce((sum, b) => {
      const batchRegistered = b.sourceFiles.reduce((s, f) => s + f.itemsRegistered, 0);
      return sum + batchRegistered;
    }, 0);

    await ctx.writeTextFile(
      path.join(outDir, "report.json"),
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

const hashFile = async (filePath: string): Promise<{ sha256: string; bytes: number }> => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    bytes += buffer.length;
  }
  return { sha256: hash.digest("hex"), bytes };
};

const buildSourceBatchManifest = async (
  batchId: string,
  files: Awaited<ReturnType<typeof listBatchSourceFiles>>,
  period: HdriPeriod,
): Promise<SourceBatchManifest> => {
  const entries = [];
  for (const file of files) {
    const digest = await hashFile(file.absolutePath);
    entries.push({
      relativePath: file.logicalPath,
      ...digest,
      parserId: file.sourceFolder,
      parserVersion: "harvest-v1",
    });
  }
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const batchHash = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return {
    schemaVersion: "1",
    batchId,
    periodAdded: period,
    batchHash,
    files: entries,
  };
};

const materializeLedgerProjection = async (
  db: ReturnType<typeof openCoreSqlite>,
  ledgerDir: string,
  sourceToken: string,
  includedBatchNames: readonly string[],
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<void> => {
  const included = new Set(includedBatchNames);
  const manifests = (await readSourceBatchManifests(ledgerDir, verificationKeys)).filter(
    (manifest) => included.has(manifest.batchId),
  );
  const discoveredIds = new Set(manifests.map((manifest) => manifest.batchId));
  const missing = includedBatchNames.filter((batchName) => !discoveredIds.has(batchName));
  if (missing.length > 0) {
    throw new Error(`Frozen frame is missing sealed source batches: ${missing.join(", ")}`);
  }
  const fileHashes = new Map<string, { batchHash: string; fileHash: string; period: HdriPeriod }>();
  for (const manifest of manifests) {
    for (const file of manifest.files) {
      fileHashes.set(`${manifest.batchId}/${file.relativePath}`, {
        batchHash: manifest.batchHash,
        fileHash: file.sha256,
        period: manifest.periodAdded,
      });
    }
  }

  const projectionDir = path.join(ledgerDir, "projections");
  await fs.mkdir(projectionDir, { recursive: true });
  const parsed = parseSourceToken(sourceToken);
  const period = `${parsed.year}-q${parsed.quarter}` as HdriPeriod;
  const occurrencePath = path.join(projectionDir, `source-occurrences-${period}.ndjson`);
  const occurrenceTemp = `${occurrencePath}.${process.pid}.${randomUUID()}.tmp`;
  const output = await fs.open(occurrenceTemp, "wx");
  const candidateDomains = new Map<ProvisionalAssetId, string>();
  try {
    const rows = db
      .prepare(
        `
      SELECT s.domain, seed.source_path, seed.source_item_key
      FROM site_source_seeds seed
      JOIN sites s ON s.id = seed.site_id
      ORDER BY seed.source_path, seed.source_item_key, s.domain
    `,
      )
      .iterate() as IterableIterator<{
      domain: string;
      source_path: string;
      source_item_key: string;
    }>;
    for (const row of rows) {
      const provenance = fileHashes.get(row.source_path);
      if (!provenance) continue;
      const provisionalAssetId = deriveAssetId(row.domain) as ProvisionalAssetId;
      candidateDomains.set(provisionalAssetId, row.domain);
      await output.write(
        `${JSON.stringify({
          sourceOccurrenceId: sourceOccurrenceId(
            provenance.batchHash,
            provenance.fileHash,
            row.source_item_key,
          ),
          batchId: row.source_path.split("/", 1)[0],
          periodAdded: provenance.period,
          provisionalAssetId,
          normalisedDomain: row.domain,
          disposition: "assertion",
        })}\n`,
      );
    }
    await output.sync();
  } finally {
    await output.close();
  }

  const occurrenceProjectionSha256 = (await hashFile(occurrenceTemp)).sha256;
  const includedBatchIds = manifests.map((manifest) => manifest.batchId).sort();
  const ledgerHead = await rebuildLedgerHead(ledgerDir, includedBatchIds);
  const frame = freezeFrame(
    period,
    [...candidateDomains]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provisionalAssetId, domain]) => ({
        sourceOccurrenceId: `frame-${provisionalAssetId}`,
        batchId: "accepted-ledger",
        periodAdded: period,
        provisionalAssetId,
        normalisedDomain: domain,
        disposition: "assertion" as const,
      })),
    {
      ledgerHead,
      occurrenceProjectionSha256,
      includedBatchIds,
    },
  );
  try {
    await publishFrozenFrameProjection(
      ledgerDir,
      frame,
      occurrenceTemp,
      undefined,
      verificationKeys,
    );
  } finally {
    await fs.unlink(occurrenceTemp).catch(() => undefined);
  }
};
