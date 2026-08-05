/*
<MODULE_CONTRACT>
<purpose>Run axe-core accessibility checks against all live sites, persist raw JSON reports to CAS, and record per-site violation counts into audits_YYYY.db.</purpose>
<non-goals>
  <item>Does not run Lighthouse performance checks (separate pipeline: 4-audit-lighthouse).</item>
  <item>Does not aggregate cross-batch statistics.</item>
  <item>Does not support fixture mode (removed in Phase B).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Heartbeat browser audits so live attempts remain exclusive until terminal evidence commits.</item>
  <item>Initial implementation: fixture + live dual-mode axe runner with rate-limited concurrency, CAS persistence, and DB upserts.</item>
  <item>Switch from resumability to deterministic subset: always audit the first N live sites; use ON CONFLICT upsert for idempotent re-runs.</item>
  <item>Emit axe-results.csv with per-site violation counts for operator review.</item>
  <item>Remove axe prefix from brief field references - this app is Axe-only.</item>
  <item>Phase B cleanup: remove fixture mode and cohort dependency; query registry.db directly for live sites.</item>
  <item>Remove auditBatchId from upserts, JSON output, and markdown report; update SQL to new schema without batch_id.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Resume across restarts: skip sites already recorded in audit_runs before starting the live audit loop.</item>
  <item>Fix COMPASS non-goal: replace wrong LighthouseAuditGogol class reference with pipeline reference.</item>
  <item>Migrate shared rate limiter import from @syrokomskyi/business-rate-limit to @syrokomskyi/rate-limit.</item>
  <item>Replace local loadTargetsFromRegistryDb and upsertEnvelope with shared loadLiveAuditTargets and upsertAuditRun from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import {
  QuarterExecutionJournal,
  assertStageComplete,
  capsuleConfigSha256,
  loadLiveAuditTargets,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  withLeaseHeartbeat,
  upsertAuditRun,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
} from "@syrokomskyi/factory-core";
import { stringify as csvStringify } from "csv-stringify/sync";
import { markdownTable } from "markdown-table";
import { RateLimiter } from "@syrokomskyi/rate-limit";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { AuditTarget, PipelineContext } from "../pipeline/types.js";
import { openAuditsDb, openRegistryDbReadOnly, openLivenessDbReadOnly } from "../db/connection.js";
import { getAuditsDbPath } from "../paths.js";
import { writeReportToCas } from "../cas/write-report.js";
import type Database from "better-sqlite3";
import { factoryRootDir } from "../config.js";

// ---------------------------------------------------------------------------
// Axe report shape — minimal subset we care about
// ---------------------------------------------------------------------------

type AxeImpact = "critical" | "serious" | "moderate" | "minor";

type AxeReport = {
  testEngine?: { name?: string; version?: string };
  violations?: Array<{
    id: string;
    impact?: AxeImpact | null;
    nodes?: Array<unknown>;
  }>;
  /** Some axe-core outputs include total nodes scanned here. Optional. */
  nodesScanned?: number;
};

export type Extracted = {
  violationsTotal: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  nodesScanned: number | null;
  axeVersion: string | null;
};

type AxeEvidence = {
  schemaVersion: 1;
  stage: "axe";
  siteId: number;
  provisionalAssetId: string;
  url: string;
  durationMs: number;
  result:
    | { ok: true; reportSha256: string; extracted: Extracted }
    | { ok: false; errorClass: string; errorMessage: string };
};

const extract = (r: AxeReport): Extracted => {
  const violations = r.violations ?? [];
  const by: Record<AxeImpact, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const v of violations) {
    if (v.impact && v.impact in by) by[v.impact] += v.nodes?.length ?? 1;
  }
  return {
    violationsTotal: violations.reduce((s, v) => s + (v.nodes?.length ?? 1), 0),
    criticalCount: by.critical,
    seriousCount: by.serious,
    moderateCount: by.moderate,
    minorCount: by.minor,
    nodesScanned: r.nodesScanned ?? null,
    axeVersion: r.testEngine?.version ?? null,
  };
};

// ---------------------------------------------------------------------------
// Live axe driver — dynamic import, fails cleanly if Playwright is absent.
// ---------------------------------------------------------------------------

const runAxeLive = async (target: AuditTarget, timeoutMs: number): Promise<AxeReport> => {
  let playwright: any;
  let AxeBuilder: any;
  try {
    playwright = await import("playwright" as string);
    const mod: any = await import("@axe-core/playwright" as string);
    AxeBuilder = mod.default ?? mod;
  } catch {
    throw new Error(
      "Live axe mode requires `playwright` and `@axe-core/playwright` to be installed.",
    );
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const results = await new AxeBuilder({ page }).analyze();
    return results as unknown as AxeReport;
  } finally {
    await browser.close();
  }
};

// ---------------------------------------------------------------------------
// DB upserts (tool-specific)
// ---------------------------------------------------------------------------

export const upsertAxe = (
  db: Database.Database,
  siteId: number,
  provisionalAssetId: string,
  x: Extracted,
  reportSha256: string | null,
): void => {
  db.prepare(
    `
    INSERT INTO axe_runs (
      site_id, provisional_asset_id, violations_total,
      critical_count, serious_count, moderate_count, minor_count,
      nodes_scanned, axe_version, report_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provisional_asset_id) DO UPDATE SET
      site_id          = excluded.site_id,
      violations_total = excluded.violations_total,
      critical_count   = excluded.critical_count,
      serious_count    = excluded.serious_count,
      moderate_count   = excluded.moderate_count,
      minor_count      = excluded.minor_count,
      nodes_scanned    = excluded.nodes_scanned,
      axe_version      = excluded.axe_version,
      report_sha256    = excluded.report_sha256
  `,
  ).run(
    siteId,
    provisionalAssetId,
    x.violationsTotal,
    x.criticalCount,
    x.seriousCount,
    x.moderateCount,
    x.minorCount,
    x.nodesScanned,
    x.axeVersion,
    reportSha256,
  );
};

// ---------------------------------------------------------------------------

export class AxeAuditGogol extends Gogol {
  override readonly id = "axe-audit";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, resolvedRegistryDbPath, resolvedLivenessDbPath } = ctx.state;

    // Derive year from sourceToken (B.1 cleanup)
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const period = `${year}-q${quarter}` as HdriPeriod;

    // Open audits DB for upserts
    const auditsDb = openAuditsDb(getAuditsDbPath(period));

    // Phase B: Query registry.db for live sites, respecting sample size
    const registryDb = openRegistryDbReadOnly(resolvedRegistryDbPath);
    const livenessDb = openLivenessDbReadOnly(resolvedLivenessDbPath);
    let targets: AuditTarget[];
    try {
      targets = loadLiveAuditTargets(registryDb, livenessDb, brief.auditSampleSize, "axe-audit");
    } finally {
      registryDb.close();
      livenessDb.close();
    }
    if (targets.length === 0) {
      console.log("[axe-audit] No targets (empty registry or no live sites)");
      auditsDb.close();
      return;
    }

    const capsuleDir = quarterCapsuleDir(factoryRootDir, brief.deviceId, period, brief.capsuleId);
    const journal = new QuarterExecutionJournal(
      quarterExecutionEventsDir(factoryRootDir, brief.deviceId, period, brief.capsuleId),
      capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan),
    );
    await journal.initialize(mintAssetId(), new Date().toISOString());
    const keyFor = (target: AuditTarget): WorkKey => ({
      period,
      capsuleId: brief.capsuleId,
      stageId: "axe",
      provisionalAssetId: target.provisionalAssetId as WorkKey["provisionalAssetId"],
      instrumentVersion: "axe-v2",
    });
    await journal.declareStageTargets({
      stageId: "axe",
      keys: targets.map(keyFor),
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    const checkpoint = (target: AuditTarget, evidence: AxeEvidence): void => {
      if (evidence.result.ok) {
        upsertAuditRun(auditsDb, {
          tool: "axe",
          siteId: target.siteId,
          provisionalAssetId: target.provisionalAssetId,
          url: target.url,
          durationMs: evidence.durationMs,
          ok: true,
          errorClass: null,
          errorMessage: null,
          reportSha256: evidence.result.reportSha256,
          source: "live",
        });
        upsertAxe(
          auditsDb,
          target.siteId,
          target.provisionalAssetId,
          evidence.result.extracted,
          evidence.result.reportSha256,
        );
      } else {
        upsertAuditRun(auditsDb, {
          tool: "axe",
          siteId: target.siteId,
          provisionalAssetId: target.provisionalAssetId,
          url: target.url,
          durationMs: evidence.durationMs,
          ok: false,
          errorClass: evidence.result.errorClass,
          errorMessage: evidence.result.errorMessage,
          reportSha256: null,
          source: "live",
        });
      }
    };
    for (const target of targets) {
      const sha256 = journal.terminalResultSha256(keyFor(target));
      if (!sha256) continue;
      const evidence = await readExecutionCasObject<AxeEvidence>(capsuleDir, sha256);
      if (evidence.provisionalAssetId !== target.provisionalAssetId)
        throw new Error(`Axe evidence identity mismatch: ${target.provisionalAssetId}`);
      checkpoint(target, evidence);
    }
    const pendingTargets = targets.filter((target) => !journal.isTerminal(keyFor(target)));
    console.log(
      `[axe-audit] Resume: ${targets.length - pendingTargets.length} terminal, ${pendingTargets.length} remaining.`,
    );
    if (pendingTargets.length === 0) {
      console.log("[axe-audit] All targets already audited.");
    }

    console.log(
      `[axe-audit] mode=live ` +
        `targets=${pendingTargets.length} concurrency=${brief.concurrency}`,
    );

    const limiter = new RateLimiter({
      concurrency: brief.concurrency,
      retry: {
        retries: 0,
        baseDelayMs: 500,
        maxDelayMs: 5_000,
        jitter: true,
      },
      breaker: {
        threshold: Math.max(3, Math.floor(targets.length * 0.2)),
        cooldownMs: 30_000,
        windowMs: 120_000,
      },
    });

    type Outcome = {
      siteId: number;
      ok: boolean;
      errorClass: string | null;
      durationMs: number;
      extracted: Extracted | null;
    };
    const results: Outcome[] = [];
    let completed = 0;
    const totalTargets = pendingTargets.length;
    const progressInterval = Math.max(1, Math.min(10, Math.floor(totalTargets / 5)));

    await Promise.all(
      pendingTargets.map((target) =>
        limiter.schedule(async () => {
          const startedAt = Date.now();
          for (let retryOrdinal = 0; retryOrdinal <= brief.retries; retryOrdinal++) {
            const leaseAt = new Date();
            const leaseDurationMs = brief.timeoutMs + 60_000;
            const attempt = await journal.begin({
              key: keyFor(target),
              attemptId: mintAssetId(),
              leaseOwner: brief.deviceId,
              now: leaseAt.toISOString(),
              leaseExpiresAt: new Date(leaseAt.getTime() + leaseDurationMs).toISOString(),
            });
            if (!attempt) return;
            try {
              const report = await withLeaseHeartbeat(journal, attempt, leaseDurationMs, () =>
                runAxeLive(target, brief.timeoutMs),
              );

              const { sha256 } = await writeReportToCas("axe", JSON.stringify(report));
              const extracted = extract(report);
              const durationMs = Date.now() - startedAt;

              const payload: AxeEvidence = {
                schemaVersion: 1,
                stage: "axe",
                siteId: target.siteId,
                provisionalAssetId: target.provisionalAssetId,
                url: target.url,
                durationMs,
                result: { ok: true, reportSha256: sha256, extracted },
              };
              const evidence = await writeExecutionCasObject(capsuleDir, payload);
              await journal.finish(attempt, {
                eventId: mintAssetId(),
                now: new Date().toISOString(),
                state: "succeeded",
                resultSha256: evidence.sha256,
              });
              checkpoint(target, payload);

              results.push({
                siteId: target.siteId,
                ok: true,
                errorClass: null,
                durationMs,
                extracted,
              });
              completed++;
              logProgress(this.id, completed, totalTargets, progressInterval, true);
              console.log(
                `[axe-audit] site ${target.siteId} (${target.domain}) ok in ${durationMs}ms ` +
                  `violations=${extracted.violationsTotal} (crit=${extracted.criticalCount} ` +
                  `ser=${extracted.seriousCount} mod=${extracted.moderateCount} min=${extracted.minorCount})`,
              );
              return;
            } catch (err) {
              const durationMs = Date.now() - startedAt;
              const errorClass =
                err instanceof Error && /timeout/i.test(err.message) ? "timeout" : "error";
              const errorMessage =
                err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
              if (retryOrdinal < brief.retries) {
                await journal.finish(attempt, {
                  eventId: mintAssetId(),
                  now: new Date().toISOString(),
                  state: "retryable",
                  errorClass,
                });
                await new Promise((resolve) =>
                  setTimeout(resolve, Math.min(5_000, 500 * 2 ** retryOrdinal)),
                );
                continue;
              }
              const payload: AxeEvidence = {
                schemaVersion: 1,
                stage: "axe",
                siteId: target.siteId,
                provisionalAssetId: target.provisionalAssetId,
                url: target.url,
                durationMs,
                result: { ok: false, errorClass, errorMessage },
              };
              const evidence = await writeExecutionCasObject(capsuleDir, payload);
              await journal.finish(attempt, {
                eventId: mintAssetId(),
                now: new Date().toISOString(),
                state: "observed-failure",
                resultSha256: evidence.sha256,
                errorClass,
              });
              checkpoint(target, payload);
              results.push({
                siteId: target.siteId,
                ok: false,
                errorClass,
                durationMs,
                extracted: null,
              });
              completed++;
              logProgress(this.id, completed, totalTargets, progressInterval, true);
              console.log(
                `[axe-audit] site ${target.siteId} (${target.domain}) FAILED (${errorClass}) in ${durationMs}ms: ${errorMessage.slice(0, 120)}`,
              );
              return;
            }
          }
        }),
      ),
    );

    await journal.sealStage({
      stageId: "axe",
      keys: targets.map(keyFor),
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });

    const terminal = auditsDb
      .prepare(
        `
      SELECT
        SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS succeeded,
        SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed
      FROM audit_runs WHERE tool = 'axe'
    `,
      )
      .get() as { succeeded: number | null; failed: number | null };
    assertStageComplete({
      targetCount: targets.length,
      succeeded: terminal.succeeded ?? 0,
      observedFailures: terminal.failed ?? 0,
      approvedExclusions: 0,
      quarantined: 0,
    });
    auditsDb.close();

    const okCount = results.filter((r) => r.ok).length;
    const okExtracted = results.filter((r) => r.extracted).map((r) => r.extracted!);
    const sum = (fn: (x: Extracted) => number): number =>
      okExtracted.reduce((s, x) => s + fn(x), 0);

    console.log(
      `[axe-audit] done: ${okCount}/${results.length} ok — ` +
        `total violations=${sum((x) => x.violationsTotal)} ` +
        `(crit=${sum((x) => x.criticalCount)} ` +
        `ser=${sum((x) => x.seriousCount)} ` +
        `mod=${sum((x) => x.moderateCount)} ` +
        `min=${sum((x) => x.minorCount)})`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "axe-results.json"),
      JSON.stringify({ mode: "live", results }, null, 2),
    );

    // Build target lookup for CSV enrichment
    const targetById = new Map(targets.map((t) => [t.siteId, t]));
    await ctx.writeTextFile(
      path.join(outDir, "axe-results.csv"),
      csvStringify([
        [
          "site_id",
          "domain",
          "ok",
          "error_class",
          "duration_ms",
          "violations_total",
          "critical",
          "serious",
          "moderate",
          "minor",
        ],
        ...results.map((r) => {
          const t = targetById.get(r.siteId);
          return [
            r.siteId,
            t?.domain ?? "",
            r.ok ? "true" : "false",
            r.errorClass ?? "",
            r.durationMs,
            r.extracted?.violationsTotal ?? "",
            r.extracted?.criticalCount ?? "",
            r.extracted?.seriousCount ?? "",
            r.extracted?.moderateCount ?? "",
            r.extracted?.minorCount ?? "",
          ];
        }),
      ]),
    );

    await ctx.writeTextFile(
      path.join(outDir, "axe-report.md"),
      [
        `# axe-core audit`,
        ``,
        `**Batch:** audit  `,
        `**Mode:** live  `,
        `**Sites:** ${results.length} (ok: ${okCount})`,
        ``,
        `## Totals (ok only)`,
        ``,
        markdownTable(
          [
            ["Impact", "Count"],
            ["Critical", String(sum((x) => x.criticalCount))],
            ["Serious", String(sum((x) => x.seriousCount))],
            ["Moderate", String(sum((x) => x.moderateCount))],
            ["Minor", String(sum((x) => x.minorCount))],
            ["**Total**", `**${sum((x) => x.violationsTotal)}**`],
          ],
          { align: ["l", "r"] },
        ),
      ].join("\n"),
    );
  }
}
