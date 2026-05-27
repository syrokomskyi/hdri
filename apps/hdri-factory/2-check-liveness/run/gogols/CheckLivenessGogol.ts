/*
<MODULE_CONTRACT>
<purpose>Check HTTP/HTTPS liveness for all domains from registry.db and persist
results to liveness.db with idempotent UPSERT semantics. Supports resumable
execution by skipping already-checked sites for the current batch.</purpose>
<keywords>liveness, http, https, upsert, resume, idempotency</keywords>
<responsibilities>
  <item>Load domain list from upstream registry.db.</item>
  <item>Skip domains already checked in the current liveness batch (resume support).</item>
  <item>Execute bounded-concurrency HTTP liveness probes with retry logic.</item>
  <item>Persist per-domain results immediately using UPSERT (atomic, crash-safe).</item>
  <item>Write summary artifacts: JSON report, Markdown report, CSV listing.</item>
</responsibilities>
<non-goals>
  <item>Does not re-check already-checked sites on resume (idempotent by design).</item>
  <item>Does not aggregate cross-batch statistics (handled by summarize-liveness).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SiteRow">Input type for site records from registry.db.</entry>
  <entry key="CheckStat">Internal accumulator for per-domain results during batch processing.</entry>
  <entry key="csvRow">CSV serialization helper with proper escaping.</entry>
  <entry key="CheckLivenessGogol">Gogol implementation that orchestrates the liveness check.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Added resume support: query already-checked sites from liveness.db and filter them out before processing. Early exit if all sites checked.</item>
  <item>Fixed artifacts to report full batch statistics from database (includes resumed sites), with optional incremental report for current run only.</item>
  <item>Replace hand-rolled CSV serialization with csv-stringify/sync package.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed scanYear field.</item>
  <item>Remove harvestBatchFilter; no longer needed with new architecture.</item>
  <item>Fail fast with a clear error when upstream registry.db is missing, using inline fs.existsSync check in run() (same pattern as 1-register-businesses).</item>
  <item>Update error message to reference 1-register-businesses as the upstream source.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs';
import path from 'node:path';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { checkSiteLiveness } from '@org/business-crawler/liveness';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openLivenessSqlite, openReadOnlySqlite } from '../db/connection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SiteRow = { id: number; domain: string };

type CheckStat = {
  domain: string;
  isLive: boolean;
  httpStatus: number | null;
  finalUrl: string | null;
  latencyMs: number;
  errorCode: string | null;
};

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class CheckLivenessGogol extends Gogol {
  override readonly id = 'check-liveness';

  override async run(ctx: PipelineContext): Promise<void> {
    const { resolvedRegistryDbPath, brief } = ctx.state;

    if (!fs.existsSync(resolvedRegistryDbPath)) {
      throw new Error(
        `[check-liveness] Upstream registry.db not found at ${resolvedRegistryDbPath}. ` +
        `Ensure 1-register-businesses has been run and the file exists.`,
      );
    }

    // ── 1. Load domains from registry.db ────────────────────────────────────
    const coreDb = openReadOnlySqlite(resolvedRegistryDbPath);

    const query = `SELECT id, domain FROM sites ORDER BY id`;

    let sites = coreDb.prepare(query).all() as SiteRow[];
    coreDb.close();

    if (brief.maxDomains >= 0) {
      sites = sites.slice(0, brief.maxDomains);
    }

    // ── 1b. Skip already-checked sites (resume support) ─────────────────────
    const { year } = parseSourceToken(brief.sourceToken);
    const resumeDb = openLivenessSqlite(year);
    const checkedRows = resumeDb
      .prepare(`SELECT site_id FROM liveness_checks`)
      .all() as { site_id: number }[];
    const checkedSiteIds = new Set(checkedRows.map((r) => r.site_id));
    resumeDb.close();

    const originalCount = sites.length;
    sites = sites.filter((s) => !checkedSiteIds.has(s.id));
    const skippedCount = originalCount - sites.length;

    console.log(
      `[check-liveness] ${originalCount} domain(s) total` +
      ` — ${skippedCount} already checked, ${sites.length} remaining` +
      ` — concurrency=${brief.concurrency} timeout=${brief.timeoutMs}ms`,
    );

    if (sites.length === 0) {
      console.log(`[check-liveness] All sites already checked. Nothing to do.`);
      return;
    }

    // ── 2. Prepare liveness.db writes ───────────────────────────────────────
    const liveDb = openLivenessSqlite(year);

    const insertStmt = liveDb.prepare<[
      number, string, number | null, string | null, number,
      number | null, number, string | null, string | null
    ]>(`
      INSERT INTO liveness_checks (
        site_id, domain,
        http_status, final_url, redirect_count,
        latency_ms, is_live,
        error_code, error_msg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        domain         = excluded.domain,
        http_status    = excluded.http_status,
        final_url      = excluded.final_url,
        redirect_count = excluded.redirect_count,
        latency_ms     = excluded.latency_ms,
        is_live        = excluded.is_live,
        error_code     = excluded.error_code,
        error_msg      = excluded.error_msg,
        checked_at     = unixepoch()
    `);

    // ── 3. Run checks with concurrency pool ─────────────────────────────────
    const stats: CheckStat[] = [];
    let completed = 0;
    const logInterval = Math.max(1, Math.min(100, Math.floor(sites.length / 50)));

    const processOne = async (site: SiteRow): Promise<void> => {
      const result = await checkSiteLiveness(site.domain, {
        timeoutMs: brief.timeoutMs,
        retryCount: brief.retryCount,
      });

      insertStmt.run(
        site.id,
        result.domain,
        result.httpStatus,
        result.finalUrl,
        result.redirectCount,
        result.latencyMs,
        result.isLive ? 1 : 0,
        result.errorCode,
        result.errorMsg,
      );

      stats.push({
        domain: result.domain,
        isLive: result.isLive,
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        latencyMs: result.latencyMs,
        errorCode: result.errorCode,
      });

      completed++;
      if (completed % logInterval === 0 || completed === sites.length) {
        logProgress(this.id, completed, sites.length, logInterval, true);
      }
    };

    // Bounded concurrency pool
    let nextIdx = 0;
    const worker = async (): Promise<void> => {
      while (nextIdx < sites.length) {
        const i = nextIdx++;
        const site = sites[i];
        if (site) await processOne(site);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(brief.concurrency, sites.length) }, worker),
    );

    liveDb.close();

    // ── 4. Load full batch stats from database (includes resumed sites) ─────
    const reportDb = openLivenessSqlite(year);

    const totalChecked = (reportDb.prepare(
      `SELECT COUNT(*) AS n FROM liveness_checks`,
    ).get() as { n: number }).n;

    const liveCount = (reportDb.prepare(
      `SELECT COUNT(*) AS n FROM liveness_checks WHERE is_live = 1`,
    ).get() as { n: number }).n;

    const deadCount = totalChecked - liveCount;

    const avgLatencyRow = reportDb.prepare(
      `SELECT COALESCE(AVG(latency_ms), 0) AS avg FROM liveness_checks WHERE latency_ms IS NOT NULL`,
    ).get() as { avg: number };
    const avgLatency = Math.round(avgLatencyRow.avg);

    // Error breakdown from full batch
    const errorRows = reportDb.prepare(
      `SELECT error_code, COUNT(*) AS n FROM liveness_checks WHERE is_live = 0 AND error_code IS NOT NULL GROUP BY error_code`,
    ).all() as { error_code: string; n: number }[];
    const errorBreakdown: Record<string, number> = {};
    for (const row of errorRows) {
      errorBreakdown[row.error_code] = row.n;
    }

    // Load all domains for CSV (full batch)
    const allDomains = reportDb.prepare(
      `SELECT domain, is_live, http_status, final_url, latency_ms, error_code FROM liveness_checks ORDER BY site_id`,
    ).all() as {
      domain: string; is_live: number; http_status: number | null;
      final_url: string | null; latency_ms: number | null; error_code: string | null;
    }[];

    reportDb.close();

    console.log(
      `[check-liveness] Done. total=${totalChecked} live=${liveCount} dead=${deadCount} avgLatency=${avgLatency}ms (this run: ${stats.length} sites)`,
    );

    // ── 5. Write artifacts ──────────────────────────────────────────────────
    const outDir = ctx.getGogolOutputDir(this.id);

    const report = {
      total: totalChecked,
      live: liveCount,
      dead: deadCount,
      avgLatencyMs: avgLatency,
      errorBreakdown,
      _meta: {
        sitesInThisRun: stats.length,
        resumed: skippedCount > 0,
        previouslyChecked: skippedCount,
      },
    };

    await ctx.writeTextFile(
      path.join(outDir, 'check-report.json'),
      JSON.stringify(report, null, 2),
    );

    const errorTableRows = Object.entries(errorBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => [code, String(n)]);

    await ctx.writeTextFile(
      path.join(outDir, 'check-report.md'),
      [
        `# Liveness Check — Report`,
        ``,
        `**Batch:** liveness`,
        ``,
        markdownTable(
          [
            ['Metric', 'Value'],
            ['Domains checked', String(totalChecked)],
            ['Live (HTTP < 500)', String(liveCount)],
            ['Dead / unreachable', String(deadCount)],
            ['Avg latency (ms)', String(avgLatency)],
          ],
          { align: ['l', 'r'] }
        ),
        ``,
        errorTableRows.length > 0
          ? [
              '## Error breakdown',
              '',
              markdownTable(
                [['Error code', 'Count'], ...errorTableRows],
                { align: ['l', 'r'] }
              ),
            ].join('\n')
          : '',
      ].join('\n'),
    );

    // Per-domain CSV for operator review (full batch from database)
    await ctx.writeTextFile(
      path.join(outDir, 'domains-checked.csv'),
      csvStringify([
        ['domain', 'is_live', 'http_status', 'final_url', 'latency_ms', 'error_code'],
        ...allDomains.map((s) => [
          s.domain, s.is_live ? 'true' : 'false', s.http_status, s.final_url, s.latency_ms, s.error_code,
        ]),
      ]),
    );

    // Incremental report for this run only (optional, for debugging)
    if (stats.length > 0 && stats.length !== totalChecked) {
      const incrementalReport = {
        _meta: { scope: 'incremental', sitesInThisRun: stats.length, previouslyChecked: skippedCount },
        total: stats.length,
        live: stats.filter((s) => s.isLive).length,
        dead: stats.filter((s) => !s.isLive).length,
      };
      await ctx.writeTextFile(
        path.join(outDir, 'check-report-incremental.json'),
        JSON.stringify(incrementalReport, null, 2),
      );
    }
  }
}

