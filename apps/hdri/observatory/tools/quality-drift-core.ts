/*
<MODULE_CONTRACT>
<purpose>Data-quality drift detection between adjacent published periods (finding 8). Catches the
"silent build degradation" a weaker agent would not notice: an unexplained shift in the score
distribution, a collapse in the scored sample size, or a spike in dead-domain share — each a
symptom of a broken crawl/scoring run masquerading as a real-world change.</purpose>
<non-goals>
  <item>Does not query the DB in driftFindings (pure, unit-testable on PeriodQuality[]).</item>
  <item>Does not set exit codes or print — callers own I/O and severity handling (incl. --allow-drift).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Finding 8: quarterly data-quality drift gate (score distribution, sample size, dead-domain share).</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import type Database from "better-sqlite3";

/** Quality vitals of one published period — the numbers that must not silently drift. */
export type PeriodQuality = {
  readonly runId: string;
  readonly period: string;
  /** Nonnull scored assets — the published N. */
  readonly n: number;
  /** Mean overall_score (0–100) over nonnull scores, or null if N = 0. */
  readonly meanScore: number | null;
  /** Median overall_score (0–100), or null if N = 0. */
  readonly medianScore: number | null;
  /** Assets recorded `closed` in THIS period (lifecycle events). */
  readonly closedThisPeriod: number;
  /** closedThisPeriod / n — the share of the sample newly marked dead, or null if N = 0. */
  readonly deadShare: number | null;
  /**
   * Comparability key: the frozen methodology_hash if present, else the scoring codebook
   * version. Two periods are score-comparable only if these match (a methodology change
   * legitimately moves the distribution, so score drift is not judged across one).
   */
  readonly comparabilityKey: string | null;
};

/** Thresholds for what counts as a WARN vs a publish-blocking ERROR. Score units are points on 0–100. */
export type DriftThresholds = {
  /** |Δ mean score| between comparable periods. */
  readonly meanShiftWarn: number;
  readonly meanShiftError: number;
  /** Fractional drop in N (e.g. 0.15 = the sample shrank by 15%). */
  readonly nDropWarn: number;
  readonly nDropError: number;
  /** Rise in dead-domain share, in absolute share points (e.g. 0.10 = +10pp). */
  readonly deadShareRiseWarn: number;
  readonly deadShareRiseError: number;
};

/**
 * Conservative defaults. Calibrated so ordinary quarter-over-quarter movement passes, but a
 * shift large enough to signal a broken build (not real-world change) trips the gate. Tune as
 * a real baseline of quarters accumulates.
 */
export const DEFAULT_DRIFT_THRESHOLDS: DriftThresholds = {
  meanShiftWarn: 5,
  meanShiftError: 12,
  nDropWarn: 0.15,
  nDropError: 0.35,
  deadShareRiseWarn: 0.1,
  deadShareRiseError: 0.25,
};

export type DriftSeverity = "WARN" | "ERROR";

export type DriftFinding = {
  readonly severity: DriftSeverity;
  readonly check: string;
  readonly message: string;
};

type ScoreStats = { n: number; mean: number | null; median: number | null };

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name),
  );
}

function scoreStats(db: Database.Database, runId: string): ScoreStats {
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS n, AVG(overall_score) AS mean
       FROM scores WHERE run_id = ? AND overall_score IS NOT NULL`,
    )
    .get(runId) as { n: number; mean: number | null };
  if (agg.n === 0) return { n: 0, mean: null, median: null };

  // Median via a single indexed offset read — bounded memory even for large runs.
  const mid = db
    .prepare(
      `SELECT overall_score AS v FROM scores
       WHERE run_id = ? AND overall_score IS NOT NULL
       ORDER BY overall_score LIMIT 1 OFFSET ?`,
    )
    .get(runId, Math.floor((agg.n - 1) / 2)) as { v: number } | undefined;

  return { n: agg.n, mean: agg.mean, median: mid?.v ?? null };
}

/**
 * Reduces one published run to its quality vitals. Read-only; the caller owns the DB handle
 * (typically the same read-only connection validate-core already opened).
 */
export function computePeriodQuality(
  db: Database.Database,
  run: { run_id: string; period: string; comparabilityKey: string | null },
): PeriodQuality {
  const stats = scoreStats(db, run.run_id);

  let closedThisPeriod = 0;
  if (tableExists(db, "asset_lifecycle_events")) {
    closedThisPeriod = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM asset_lifecycle_events
           WHERE event_type = 'closed' AND period = ?`,
        )
        .get(run.period) as { c: number }
    ).c;
  }

  return {
    runId: run.run_id,
    period: run.period,
    n: stats.n,
    meanScore: stats.mean,
    medianScore: stats.median,
    closedThisPeriod,
    deadShare: stats.n > 0 ? closedThisPeriod / stats.n : null,
    comparabilityKey: run.comparabilityKey,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Compares each adjacent pair of periods (assumed already ordered by period) and returns drift
 * findings. Score-distribution drift is judged only across a comparable methodology boundary;
 * sample-size and dead-domain drift are always judged (they are collection-quality signals,
 * independent of the scoring methodology).
 */
export function driftFindings(
  periods: readonly PeriodQuality[],
  thresholds: DriftThresholds = DEFAULT_DRIFT_THRESHOLDS,
): DriftFinding[] {
  const out: DriftFinding[] = [];

  for (let i = 1; i < periods.length; i++) {
    const prev = periods[i - 1]!;
    const cur = periods[i]!;
    const tag = `${prev.period} → ${cur.period}`;

    // ── Score-distribution drift (comparable methodology only) ────────────────
    const comparable =
      prev.comparabilityKey !== null &&
      cur.comparabilityKey !== null &&
      prev.comparabilityKey === cur.comparabilityKey;
    if (comparable && prev.meanScore !== null && cur.meanScore !== null) {
      const shift = Math.abs(cur.meanScore - prev.meanScore);
      if (shift >= thresholds.meanShiftError) {
        out.push({
          severity: "ERROR",
          check: "score-distribution-drift",
          message: `${tag}: mean score moved ${round1(shift)} pts (${round1(prev.meanScore)} → ${round1(cur.meanScore)}) under identical methodology — a shift this large signals a broken scoring/crawl run, not a real-world change. Investigate before publishing (override with --allow-drift once confirmed real).`,
        });
      } else if (shift >= thresholds.meanShiftWarn) {
        out.push({
          severity: "WARN",
          check: "score-distribution-drift",
          message: `${tag}: mean score moved ${round1(shift)} pts (${round1(prev.meanScore)} → ${round1(cur.meanScore)}) under identical methodology — larger than typical; confirm it is real.`,
        });
      }
    }

    // ── Sample-size collapse ──────────────────────────────────────────────────
    if (prev.n > 0) {
      const drop = (prev.n - cur.n) / prev.n;
      if (drop >= thresholds.nDropError) {
        out.push({
          severity: "ERROR",
          check: "sample-size-drift",
          message: `${tag}: scored sample fell ${(drop * 100).toFixed(0)}% (N ${prev.n} → ${cur.n}) — likely a partial crawl/scoring run. Aggregates would be built on a truncated population.`,
        });
      } else if (drop >= thresholds.nDropWarn) {
        out.push({
          severity: "WARN",
          check: "sample-size-drift",
          message: `${tag}: scored sample fell ${(drop * 100).toFixed(0)}% (N ${prev.n} → ${cur.n}) — confirm the drop is expected.`,
        });
      }
    }

    // ── Dead-domain share spike ───────────────────────────────────────────────
    if (prev.deadShare !== null && cur.deadShare !== null) {
      const rise = cur.deadShare - prev.deadShare;
      if (rise >= thresholds.deadShareRiseError) {
        out.push({
          severity: "ERROR",
          check: "dead-domain-drift",
          message: `${tag}: dead-domain share rose ${(rise * 100).toFixed(0)}pp (${(prev.deadShare * 100).toFixed(0)}% → ${(cur.deadShare * 100).toFixed(0)}%) — a spike this size usually means a liveness/crawl outage falsely marked live businesses dead, not mass closures.`,
        });
      } else if (rise >= thresholds.deadShareRiseWarn) {
        out.push({
          severity: "WARN",
          check: "dead-domain-drift",
          message: `${tag}: dead-domain share rose ${(rise * 100).toFixed(0)}pp (${(prev.deadShare * 100).toFixed(0)}% → ${(cur.deadShare * 100).toFixed(0)}%) — confirm these closures are real.`,
        });
      }
    }
  }

  return out;
}
