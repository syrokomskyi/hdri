/*
<MODULE_CONTRACT>
<purpose>Base class for focused single-signal extraction gogols.</purpose>
<keywords>extract, base, concurrency, batch upsert</keywords>
<responsibilities>
  <item>Provide a reusable run() loop with bounded-concurrency worker pool.</item>
  <item>Batch already-done check via a single SELECT + in-memory Set.</item>
  <item>Collect extracted params in memory and flush via a single SQLite transaction.</item>
  <item>Delegate per-row extraction logic to concrete subclasses.</item>
</responsibilities>
<non-goals>
  <item>Does not perform network fetches — that is CrawlGogol's responsibility.</item>
  <item>Does not define per-signal extraction rules — those live in @org/business-crawler/extract.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractGogolBase.run">Orchestrates concurrent extraction and batch DB writes.</entry>
  <entry key="ExtractGogolBase.extract">Abstract hook for per-page signal extraction.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created ExtractGogolBase to eliminate duplicated extraction boilerplate across ~44 gogols.</item>
  <item>Adds bounded-concurrency worker pool for CPU-bound cheerio parsing.</item>
  <item>Replaces per-row already-done SELECT with a single upfront query into a Set.</item>
  <item>Replaces per-row SQLite writes with a single end-of-loop transaction.</item>
  <item>Refactored all extractor gogols to extend ExtractGogolBase (simple, url_norm, custom report fields).</item>
  <item>Add detailed counters: alreadyDoneCount, missingFileCount, presentCount to extract-report.json and console output.</item>
  <item>Add sourceToken to extract-report.json for traceability.</item>
  <item>Add optional extracted-records.csv artifact via csvColumns override.</item>
  <item>Replace extract(html, row) with extractDom($, row) to leverage shared Cheerio DOM cache (DomCache).</item>
  <item>Integrate ctx.domCache.getOrLoad() so each page is parsed once and reused across gogols within cache capacity.</item>
  <item>Add domCache hit/miss/size counters to console output for observability.</item>
  <item>Call ctx.domCache.evict() immediately after extractDom() so Cheerio DOM is eligible for GC and does not accumulate in memory across thousands of pages.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix idempotency: add JOIN site_pages and WHERE sp.source = 'homepage' to querySql so extraction gogols only process homepage observations, not detected pages fetched later.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { type CheerioAPI } from '@org/business-crawler/extract';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { parseSourceToken } from '@org/observatory-crypto';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openPagesDb } from '../db/connection.js';
import { getPagesDbPath, getContentRootDir } from '../paths.js';
import { RULE_EXTRACTOR_VER } from '../constants.js';

export type ObsRow = {
  content_sha256: string;
  storage_path: string;
  url_norm?: string;
};

export type ExtractResultItem = {
  sha256: string;
  params: unknown[];
};

export abstract class ExtractGogolBase extends Gogol {
  /** The ext_* table name this gogol writes into. */
  abstract readonly table: string;

  /** Override to include url_norm or other columns / joins. */
  protected get querySql(): string {
    return `SELECT po.content_sha256, pc.storage_path FROM page_observations po JOIN page_contents pc ON pc.sha256 = po.content_sha256 JOIN site_pages sp ON sp.id = po.site_page_id WHERE sp.source = 'homepage'`;
  }

  /**
   * Extract from the parsed Cheerio DOM. Return an array of SQL parameter values
   * (content_sha256 and extractor_ver are prepended automatically by run()).
   * Return `null` to skip the row entirely.
   */
  protected abstract extractDom($: CheerioAPI, row: ObsRow): unknown[] | null;

  /** The full INSERT / UPSERT SQL. Must accept params in the same order as extract returns,
   *  with content_sha256 and extractor_ver as the first two params. */
  protected abstract get upsertSql(): string;

  /** Max concurrent page extractions. Defaults to brief.concurrency. */
  protected getConcurrency(briefConcurrency: number): number {
    return briefConcurrency;
  }

  /** Interval for progress logging. */
  protected get progressInterval(): number {
    return 1000;
  }

  /** Hook for subclasses that need custom report fields (e.g. totalEmails). */
  protected afterProcessResults(_results: ExtractResultItem[]): Record<string, unknown> {
    return {};
  }

  /** Override to emit a CSV artifact `extracted-records.csv`. Return column names including `content_sha256` first. */
  protected get csvColumns(): string[] | undefined {
    return undefined;
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;
    const db = openPagesDb(getPagesDbPath(year, half));
    const contentRoot = getContentRootDir();

    const rows = db.prepare<[]>(this.querySql).all() as ObsRow[];

    console.log(`[${this.id}] ${rows.length} page(s) to process`);

    // 1. Batch already-done check
    const doneSet = new Set<string>(
      db.prepare(`SELECT content_sha256 FROM ${this.table} WHERE extractor_ver = ?`)
        .pluck()
        .all(RULE_EXTRACTOR_VER) as string[],
    );

    const results: ExtractResultItem[] = [];
    let parsed = 0;
    let skipped = 0;
    let alreadyDoneCount = 0;
    let missingFileCount = 0;
    let presentCount = 0;
    let completed = 0;
    const logEvery = Math.max(1, Math.min(500, Math.ceil(rows.length / 4)));

    const processOne = async (row: ObsRow): Promise<void> => {
      if (doneSet.has(row.content_sha256)) {
        alreadyDoneCount++;
        skipped++;
        completed++;
        return;
      }

      const filePath = path.join(contentRoot, row.storage_path);
      let $: CheerioAPI;
      try {
        const entry = await ctx.domCache.getOrLoad(row.content_sha256, filePath);
        $ = entry.$;
      } catch {
        missingFileCount++;
        skipped++;
        completed++;
        return;
      }

      const params = this.extractDom($, row);
      ctx.domCache.evict(row.content_sha256);
      if (params) {
        results.push({ sha256: row.content_sha256, params });
        parsed++;
        if (typeof params[0] === 'number' && params[0] > 0) {
          presentCount++;
        }
      }
      completed++;

      if (completed % logEvery === 0 || completed === rows.length) {
        logProgress(this.id, completed, rows.length, logEvery, true);
      }
    };

    // 2. Bounded concurrency worker pool
    let idx = 0;
    const worker = async (): Promise<void> => {
      while (idx < rows.length) {
        const row = rows[idx++];
        if (row) await processOne(row);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.getConcurrency(brief.concurrency), rows.length || 1) }, worker),
    );

    // 3. Batch upsert in a single transaction
    if (results.length > 0) {
      const stmt = db.prepare(this.upsertSql);
      db.transaction(() => {
        for (const r of results) {
          stmt.run(r.sha256, RULE_EXTRACTOR_VER, ...r.params);
        }
      })();
    }

    db.close();

    const cacheStats = ctx.domCache.stats;
    console.log(
      `[${this.id}] Done. total=${rows.length} parsed=${parsed} skipped=${skipped} alreadyDone=${alreadyDoneCount} missingFile=${missingFileCount} present=${presentCount} cache=${cacheStats.size} hit=${cacheStats.hitCount} miss=${cacheStats.missCount}`,
    );

    const extraFields = this.afterProcessResults(results);
    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'extract-report.json'),
      JSON.stringify(
        {
          sourceToken: brief.sourceToken,
          total: rows.length,
          parsed,
          skipped,
          alreadyDoneCount,
          missingFileCount,
          presentCount,
          ...extraFields,
        },
        null,
        2,
      ),
    );

    // 4. Optional CSV artifact
    const columns = this.csvColumns;
    if (columns && results.length > 0) {
      const csvRows = results.map((r) => [r.sha256, ...r.params.map((p) => (p == null ? '' : String(p)))]);
      await ctx.writeTextFile(
        path.join(outDir, 'extracted-records.csv'),
        csvStringify([columns, ...csvRows]),
      );
    }
  }
}
