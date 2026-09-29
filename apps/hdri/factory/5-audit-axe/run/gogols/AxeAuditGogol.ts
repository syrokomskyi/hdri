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
  <item>RFC-0105/ADR-0023: replace per-target browser launch with supervised worker pool, preflight self-test, challenge detector, and BrowserEvidence contract.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import {
  QuarterExecutionJournal,
  assertStageComplete,
  capsuleConfigSha256,
  commitAttempt,
  declareStageTargetSet,
  allocateLeaseEpoch,
  openExecutionDb,
  loadLiveAuditTargets,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  snapshotCapsuleDbArtifact,
  withLeaseHeartbeat,
  upsertAuditRun,
  workKeyId,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
  type BrowserEvidence,
} from "@syrokomskyi/factory-core";
import pLimit from "p-limit";
import { stringify as csvStringify } from "csv-stringify/sync";
import { markdownTable } from "markdown-table";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { AuditTarget, PipelineContext } from "../pipeline/types.js";
import { openAuditsDb, openRegistryDbReadOnly, openLivenessDbReadOnly } from "../db/connection.js";
import { getAuditsDbPath } from "../paths.js";
import { writeReportToCas } from "../cas/write-report.js";
import type Database from "better-sqlite3";
import { factoryRootDir } from "../config.js";
import {
  WorkerPool,
  computeEnvironmentSha256,
  computePolicySha256,
  defaultWorkerEntryPath,
} from "../browser/worker-pool.js";
import { preflight } from "../browser/preflight.js";

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
  schemaVersion: 2;
  stage: "axe";
  siteId: number;
  provisionalAssetId: string;
  url: string;
  durationMs: number;
  browserEvidence: BrowserEvidence;
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

/**
 * RFC-0128 (issue 03): a capped auditSampleSize run is a partial sample —
 * it must not seal, matching the maxDomains gate in the other stages.
 */
export const shouldSealAxeStage = (brief: { auditSampleSize: number }): boolean =>
  brief.auditSampleSize < 0;

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

    // RFC-0114: Open SQLite durable authority and declare stage targets
    const durableDb = openExecutionDb(capsuleDir);
    const configSha = capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan);
    declareStageTargetSet(durableDb, {
      stageId: "axe",
      deviceId: brief.deviceId,
      workKeyIds: targets.map((t) => workKeyId(keyFor(t))),
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

    // Preflight self-test (RFC-0105)
    const preflightResult = await preflight();
    if (!preflightResult.ok) {
      console.log("[axe-audit] Preflight FAILED — acquiring zero target leases.");
      for (const v of preflightResult.violations) {
        console.log(`[axe-audit] Preflight violation: ${v}`);
      }
      auditsDb.close();
      return;
    }
    console.log(
      `[axe-audit] Preflight OK — browser digest=${preflightResult.browserDigest.slice(0, 16)}… ` +
        `engine=${preflightResult.engineVersion}`,
    );

    const environmentSha256 = computeEnvironmentSha256(
      preflightResult.browserDigest,
      preflightResult.engineVersion,
    );
    const policySha256 = computePolicySha256({
      poolSize: brief.poolSize,
      recycleAfterTargets: brief.recycleAfterTargets,
      deadlineMs: brief.deadlineMs,
      terminationGraceMs: brief.terminationGraceMs,
    });

    const pool = new WorkerPool({
      poolSize: brief.poolSize,
      recycleAfterTargets: brief.recycleAfterTargets,
      deadlineMs: brief.deadlineMs,
      terminationGraceMs: brief.terminationGraceMs,
      workerEntryPath: defaultWorkerEntryPath(),
      environmentSha256,
      policySha256,
    });
    await pool.start();

    console.log(
      `[axe-audit] mode=live pool ` +
        `targets=${pendingTargets.length} poolSize=${brief.poolSize} ` +
        `deadline=${brief.deadlineMs}ms grace=${brief.terminationGraceMs}ms`,
    );

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

    // Bound in-flight targets: each concurrent task holds a journal lease, a
    // heartbeat timer, and a pool queue slot. Launching all targets at once
    // (unbounded Promise.all) exhausts memory/swap and starves the worker pool
    // at 100k+ scale. Keep at least poolSize in flight so workers never starve.
    const limit = pLimit(Math.max(brief.concurrency, brief.poolSize));

    try {
      await Promise.all(
        pendingTargets.map((target) =>
          limit(async () => {
            const startedAt = Date.now();
            for (let retryOrdinal = 0; retryOrdinal <= brief.retries; retryOrdinal++) {
              const leaseAt = new Date();
              const measuredAt = leaseAt.toISOString();
              const leaseDurationMs = brief.deadlineMs + 60_000;
              const wkId = workKeyId(keyFor(target));
              const durableAttemptId = mintAssetId();
              const epoch = allocateLeaseEpoch(durableDb, wkId, durableAttemptId, measuredAt);
              const attempt = await journal.begin({
                key: keyFor(target),
                attemptId: mintAssetId(),
                leaseOwner: brief.deviceId,
                now: measuredAt,
                leaseExpiresAt: new Date(leaseAt.getTime() + leaseDurationMs).toISOString(),
              });
              if (!attempt) return;
              try {
                const response = await withLeaseHeartbeat(journal, attempt, leaseDurationMs, () =>
                  pool.acquire(
                    {
                      siteId: target.siteId,
                      provisionalAssetId: target.provisionalAssetId,
                      domain: target.domain,
                      url: target.url,
                    },
                    target.provisionalAssetId,
                  ),
                );

                const browserEvidence = response.evidence;
                const durationMs = Date.now() - startedAt;

                if (browserEvidence.outcome === "measured" && response.axeReport) {
                  const report = response.axeReport as AxeReport;
                  const { sha256 } = await writeReportToCas("axe", JSON.stringify(report));
                  const extracted = extract(report);

                  const payload: AxeEvidence = {
                    schemaVersion: 2,
                    stage: "axe",
                    siteId: target.siteId,
                    provisionalAssetId: target.provisionalAssetId,
                    url: target.url,
                    durationMs,
                    browserEvidence,
                    result: { ok: true, reportSha256: sha256, extracted },
                  };
                  const evidence = await writeExecutionCasObject(capsuleDir, payload);
                  // RFC-0114: Commit through durable authority
                  commitAttempt(durableDb, {
                    workKeyId: wkId,
                    attemptId: durableAttemptId,
                    epoch,
                    measuredAt,
                    inputFingerprint: configSha,
                    evidence: [{ role: "axe-report", sha256: evidence.sha256, bytes: 0 }],
                    outcome: "succeeded",
                  });
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
                } else {
                  const errorClass = browserEvidence.outcome;
                  const errorMessage = `Browser evidence outcome: ${browserEvidence.outcome} (status=${browserEvidence.mainStatus})`;

                  const payload: AxeEvidence = {
                    schemaVersion: 2,
                    stage: "axe",
                    siteId: target.siteId,
                    provisionalAssetId: target.provisionalAssetId,
                    url: target.url,
                    durationMs,
                    browserEvidence,
                    result: { ok: false, errorClass, errorMessage },
                  };
                  const evidence = await writeExecutionCasObject(capsuleDir, payload);
                  // RFC-0114: Commit through durable authority
                  commitAttempt(durableDb, {
                    workKeyId: wkId,
                    attemptId: durableAttemptId,
                    epoch,
                    measuredAt,
                    inputFingerprint: configSha,
                    evidence: [{ role: "axe-failure", sha256: evidence.sha256, bytes: 0 }],
                    outcome: "failed",
                  });
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
                    `[axe-audit] site ${target.siteId} (${target.domain}) ${errorClass} in ${durationMs}ms`,
                  );
                  return;
                }
              } catch (err) {
                const durationMs = Date.now() - startedAt;
                const errorClass =
                  err instanceof Error && /timeout|deadline/i.test(err.message)
                    ? "timeout"
                    : "error";
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
                  schemaVersion: 2,
                  stage: "axe",
                  siteId: target.siteId,
                  provisionalAssetId: target.provisionalAssetId,
                  url: target.url,
                  durationMs,
                  browserEvidence: {
                    schema: "hdri-browser-evidence@1",
                    workKey: target.provisionalAssetId,
                    measuredAt: new Date().toISOString(),
                    endpoint: target.url,
                    mainStatus: null,
                    effectiveUrl: target.url,
                    outcome: "instrument-failed",
                    environmentSha256,
                    renderedDomSha256: null,
                    reportSha256: null,
                    deadlineMs: brief.deadlineMs,
                    policySha256,
                  },
                  result: { ok: false, errorClass, errorMessage },
                };
                const evidence = await writeExecutionCasObject(capsuleDir, payload);
                // RFC-0114: Commit through durable authority
                commitAttempt(durableDb, {
                  workKeyId: wkId,
                  attemptId: durableAttemptId,
                  epoch,
                  measuredAt,
                  inputFingerprint: configSha,
                  evidence: [{ role: "axe-error", sha256: evidence.sha256, bytes: 0 }],
                  outcome: "failed",
                });
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
    } finally {
      await pool.shutdown();
    }

    // RFC-0128 (issue 03): a capped auditSampleSize run is a partial sample —
    // it must not seal, matching the maxDomains gate in the other stages.
    if (shouldSealAxeStage(brief)) {
      // RFC-0128: the axe DB is final at seal-time — snapshot it into the
      // capsule and declare it as this stage's output artifact.
      const axeDbArtifact = await snapshotCapsuleDbArtifact(
        capsuleDir,
        "axe",
        brief.deviceId,
        getAuditsDbPath(period),
      );
      await journal.sealStage({
        stageId: "axe",
        keys: targets.map(keyFor),
        eventId: mintAssetId(),
        now: new Date().toISOString(),
        outputArtifacts: [axeDbArtifact],
      });
    }

    // audit_runs is an append-only log that can retain stale rows from prior
    // runs whose target derivation differed from the frozen set (e.g. 19
    // residual assets). A raw COUNT(*) would over-count vs targets.length, so
    // scope the cross-check to the declared target assets only.
    auditsDb
      .prepare(`CREATE TEMP TABLE _axe_target_assets (provisional_asset_id TEXT PRIMARY KEY)`)
      .run();
    const insTarget = auditsDb.prepare(
      `INSERT OR IGNORE INTO _axe_target_assets (provisional_asset_id) VALUES (?)`,
    );
    auditsDb.transaction((ids: readonly string[]) => {
      for (const id of ids) insTarget.run(id);
    })(targets.map((t) => t.provisionalAssetId));
    const terminal = auditsDb
      .prepare(
        `
      SELECT
        SUM(CASE WHEN ar.ok = 1 THEN 1 ELSE 0 END) AS succeeded,
        SUM(CASE WHEN ar.ok = 0 THEN 1 ELSE 0 END) AS failed
      FROM audit_runs ar
      JOIN _axe_target_assets ta ON ta.provisional_asset_id = ar.provisional_asset_id
      WHERE ar.tool = 'axe'
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
