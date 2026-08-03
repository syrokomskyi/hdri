/*
<MODULE_CONTRACT>
<purpose>Check HTTP/HTTPS liveness for all domains from registry.db and persist
results to liveness.db with idempotent UPSERT semantics. Supports resumable
execution by skipping already-checked sites for the current batch.</purpose>
<non-goals>
  <item>Does not re-check already-checked sites on resume (idempotent by design).</item>
  <item>Does not aggregate cross-batch statistics (handled by summarize-liveness).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Renew execution leases while bounded liveness measurements are active.</item>
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

import fs from "node:fs";
import path from "node:path";
import { stringify as csvStringify } from "csv-stringify/sync";
import { markdownTable } from "markdown-table";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import {
  QuarterExecutionJournal,
  capsuleConfigSha256,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  withLeaseHeartbeat,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
} from "@syrokomskyi/factory-core";
import { checkSiteLiveness } from "@syrokomskyi/business-crawler/liveness";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openLivenessSqlite, openReadOnlySqlite } from "../db/connection.js";
import { factoryRootDir } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SiteRow = { id: number; domain: string; provisionalAssetId: string };

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
  override readonly id = "check-liveness";

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

    const query = `
      SELECT s.id, s.domain, br.da_id AS provisionalAssetId
      FROM sites s JOIN business_registry br ON br.domain = s.domain
      ORDER BY br.da_id`;

    let sites = coreDb.prepare(query).all() as SiteRow[];
    coreDb.close();

    const stageTargetSites = sites;
    if (brief.maxDomains >= 0) {
      sites = sites.slice(0, brief.maxDomains);
    }

    // ── 1b. Rebuild resume truth from append-only capsule events ────────────
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const period = `${year}-q${quarter}` as HdriPeriod;
    const capsuleDir = quarterCapsuleDir(factoryRootDir, brief.deviceId, period, brief.capsuleId);
    const journal = new QuarterExecutionJournal(
      quarterExecutionEventsDir(factoryRootDir, brief.deviceId, period, brief.capsuleId),
      capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan),
    );
    await journal.initialize(mintAssetId(), new Date().toISOString());
    const keyFor = (site: SiteRow): WorkKey => ({
      period,
      capsuleId: brief.capsuleId,
      stageId: "liveness",
      provisionalAssetId: site.provisionalAssetId as WorkKey["provisionalAssetId"],
      instrumentVersion: "liveness-v2",
    });
    await journal.declareStageTargets({
      stageId: "liveness",
      keys: stageTargetSites.map(keyFor),
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });

    // ── 2. Prepare checkpoint DB writes ─────────────────────────────────────
    const liveDb = openLivenessSqlite(period);

    const insertStmt = liveDb.prepare<
      [
        number,
        string,
        string,
        number | null,
        string | null,
        number,
        number | null,
        number,
        string | null,
        string | null,
      ]
    >(`
      INSERT INTO liveness_checks (
        site_id, provisional_asset_id, domain,
        http_status, final_url, redirect_count,
        latency_ms, is_live,
        error_code, error_msg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provisional_asset_id) DO UPDATE SET
        site_id        = excluded.site_id,
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

    type LivenessResult = Awaited<ReturnType<typeof checkSiteLiveness>>;
    type LivenessEvidence = {
      schemaVersion: 1;
      stage: "liveness";
      siteId: number;
      provisionalAssetId: string;
      result: LivenessResult;
    };
    const checkpoint = (site: SiteRow, result: LivenessResult): void => {
      insertStmt.run(
        site.id,
        site.provisionalAssetId,
        result.domain,
        result.httpStatus,
        result.finalUrl,
        result.redirectCount,
        result.latencyMs,
        result.isLive ? 1 : 0,
        result.errorCode,
        result.errorMsg,
      );
    };

    for (const site of sites) {
      const sha256 = journal.terminalResultSha256(keyFor(site));
      if (!sha256) continue;
      const evidence = await readExecutionCasObject<LivenessEvidence>(capsuleDir, sha256);
      if (evidence.provisionalAssetId !== site.provisionalAssetId) {
        throw new Error(`Liveness evidence identity mismatch: ${site.provisionalAssetId}`);
      }
      checkpoint(site, evidence.result);
    }

    const originalCount = sites.length;
    sites = sites.filter((site) => !journal.isTerminal(keyFor(site)));
    const skippedCount = originalCount - sites.length;
    console.log(
      `[check-liveness] ${originalCount} domain(s) total — ${skippedCount} terminal, ${sites.length} remaining` +
        ` — concurrency=${brief.concurrency} timeout=${brief.timeoutMs}ms`,
    );

    // ── 3. Run checks with concurrency pool ─────────────────────────────────
    const stats: CheckStat[] = [];
    let completed = 0;
    const logInterval = Math.max(1, Math.min(100, Math.floor(sites.length / 50)));

    const processOne = async (site: SiteRow): Promise<void> => {
      const startedAt = new Date();
      const leaseDurationMs = brief.timeoutMs * (brief.retryCount + 1) + 60_000;
      const attempt = await journal.begin({
        key: keyFor(site),
        attemptId: mintAssetId(),
        leaseOwner: brief.deviceId,
        now: startedAt.toISOString(),
        leaseExpiresAt: new Date(startedAt.getTime() + leaseDurationMs).toISOString(),
      });
      if (!attempt) return;
      const result = await withLeaseHeartbeat(journal, attempt, leaseDurationMs, () =>
        checkSiteLiveness(site.domain, {
          timeoutMs: brief.timeoutMs,
          retryCount: brief.retryCount,
        }),
      );
      const evidence = await writeExecutionCasObject(capsuleDir, {
        schemaVersion: 1,
        stage: "liveness",
        siteId: site.id,
        provisionalAssetId: site.provisionalAssetId,
        result,
      } satisfies LivenessEvidence);
      await journal.finish(attempt, {
        eventId: mintAssetId(),
        now: new Date().toISOString(),
        state: "succeeded",
        resultSha256: evidence.sha256,
      });
      checkpoint(site, result);

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

    await Promise.all(Array.from({ length: Math.min(brief.concurrency, sites.length) }, worker));

    if (brief.maxDomains < 0) {
      await journal.sealStage({
        stageId: "liveness",
        keys: stageTargetSites.map(keyFor),
        eventId: mintAssetId(),
        now: new Date().toISOString(),
      });
    }

    liveDb.close();

    // ── 4. Load full batch stats from database (includes resumed sites) ─────
    const reportDb = openLivenessSqlite(period);

    const totalChecked = (
      reportDb.prepare(`SELECT COUNT(*) AS n FROM liveness_checks`).get() as { n: number }
    ).n;

    const liveCount = (
      reportDb.prepare(`SELECT COUNT(*) AS n FROM liveness_checks WHERE is_live = 1`).get() as {
        n: number;
      }
    ).n;

    const deadCount = totalChecked - liveCount;

    const avgLatencyRow = reportDb
      .prepare(
        `SELECT COALESCE(AVG(latency_ms), 0) AS avg FROM liveness_checks WHERE latency_ms IS NOT NULL`,
      )
      .get() as { avg: number };
    const avgLatency = Math.round(avgLatencyRow.avg);

    // Error breakdown from full batch
    const errorRows = reportDb
      .prepare(
        `SELECT error_code, COUNT(*) AS n FROM liveness_checks WHERE is_live = 0 AND error_code IS NOT NULL GROUP BY error_code`,
      )
      .all() as { error_code: string; n: number }[];
    const errorBreakdown: Record<string, number> = {};
    for (const row of errorRows) {
      errorBreakdown[row.error_code] = row.n;
    }

    // Load all domains for CSV (full batch)
    const allDomains = reportDb
      .prepare(
        `SELECT domain, is_live, http_status, final_url, latency_ms, error_code FROM liveness_checks ORDER BY site_id`,
      )
      .all() as {
      domain: string;
      is_live: number;
      http_status: number | null;
      final_url: string | null;
      latency_ms: number | null;
      error_code: string | null;
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
      path.join(outDir, "check-report.json"),
      JSON.stringify(report, null, 2),
    );

    const errorTableRows = Object.entries(errorBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => [code, String(n)]);

    await ctx.writeTextFile(
      path.join(outDir, "check-report.md"),
      [
        `# Liveness Check — Report`,
        ``,
        `**Batch:** liveness`,
        ``,
        markdownTable(
          [
            ["Metric", "Value"],
            ["Domains checked", String(totalChecked)],
            ["Live (HTTP < 500)", String(liveCount)],
            ["Dead / unreachable", String(deadCount)],
            ["Avg latency (ms)", String(avgLatency)],
          ],
          { align: ["l", "r"] },
        ),
        ``,
        errorTableRows.length > 0
          ? [
              "## Error breakdown",
              "",
              markdownTable([["Error code", "Count"], ...errorTableRows], { align: ["l", "r"] }),
            ].join("\n")
          : "",
      ].join("\n"),
    );

    // Per-domain CSV for operator review (full batch from database)
    await ctx.writeTextFile(
      path.join(outDir, "domains-checked.csv"),
      csvStringify([
        ["domain", "is_live", "http_status", "final_url", "latency_ms", "error_code"],
        ...allDomains.map((s) => [
          s.domain,
          s.is_live ? "true" : "false",
          s.http_status,
          s.final_url,
          s.latency_ms,
          s.error_code,
        ]),
      ]),
    );

    // Incremental report for this run only (optional, for debugging)
    if (stats.length > 0 && stats.length !== totalChecked) {
      const incrementalReport = {
        _meta: {
          scope: "incremental",
          sitesInThisRun: stats.length,
          previouslyChecked: skippedCount,
        },
        total: stats.length,
        live: stats.filter((s) => s.isLive).length,
        dead: stats.filter((s) => !s.isLive).length,
      };
      await ctx.writeTextFile(
        path.join(outDir, "check-report-incremental.json"),
        JSON.stringify(incrementalReport, null, 2),
      );
    }
  }
}
