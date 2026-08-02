/*
<MODULE_CONTRACT>
<purpose>Post-stratified (population-weighted) headline trend — corrects sample composition — this module handles poststrat-core operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not ship a default frame. Without a real frame file, no post-stratified numbers are emitted —
        publishing fabricated weights would violate the index's scientific integrity.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP4: post-stratification engine, frame-gated (no fabricated weights), with coverage reporting.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Reference population frame: stratum key → relative weight (e.g. the count of
 * Handwerk businesses in that Bundesland × Destatis-group). Keys must match the
 * `${bundesland}|${destatis_group}` form produced by the exporter.
 */
export type PopulationFrame = {
  strataSystem: string;
  source: string;
  weights: Record<string, number>;
};

export type StratifiedAsset = { stratumKey: string; score: number };

export type PostStratResult = {
  weightedMean: number | null;
  /** Strata present in BOTH the sample and the frame. */
  coveredStrata: number;
  frameStrata: number;
  /** Fraction of total frame weight covered by sampled strata (0..1). */
  weightCoverage: number;
};

export type PostStratPoint = {
  period: string;
  previousPeriod: string | null;
  weightedMean: number | null;
  delta: number | null;
  coveredStrata: number;
  frameStrata: number;
  weightCoverage: number;
  suppressed: boolean;
};

const round = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export async function loadPopulationFrame(inputDir: string): Promise<PopulationFrame | null> {
  const framePath = path.join(inputDir, "population-frame.json");
  try {
    const raw = await fs.readFile(framePath, "utf-8");
    const parsed = JSON.parse(raw) as PopulationFrame;
    if (!parsed.weights || Object.keys(parsed.weights).length === 0) return null;
    // A frame with no positive weight (e.g. the shipped all-zero template copied
    // verbatim) is treated as absent — never produce post-stratified output from it.
    const totalWeight = Object.values(parsed.weights).reduce((s, w) => s + (w > 0 ? w : 0), 0);
    if (totalWeight <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Population-weighted mean: average the per-stratum sample means using frame
 * weights, restricted to strata present in both sample and frame, renormalised
 * by the covered weight. Returns weightCoverage so callers can caveat thin frames.
 */
export function postStratifiedMean(
  assets: StratifiedAsset[],
  frame: PopulationFrame,
): PostStratResult {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const a of assets) {
    const cur = sums.get(a.stratumKey);
    if (cur) {
      cur.sum += a.score;
      cur.n += 1;
    } else {
      sums.set(a.stratumKey, { sum: a.score, n: 1 });
    }
  }

  const frameStrata = Object.keys(frame.weights).length;
  const totalFrameWeight = Object.values(frame.weights).reduce((s, w) => s + w, 0);

  let weightedSum = 0;
  let coveredWeight = 0;
  let coveredStrata = 0;
  for (const [key, agg] of sums) {
    const w = frame.weights[key];
    if (w == null || w <= 0) continue; // stratum not in frame → cannot weight it
    weightedSum += w * (agg.sum / agg.n);
    coveredWeight += w;
    coveredStrata += 1;
  }

  const weightCoverage = totalFrameWeight > 0 ? round2(coveredWeight / totalFrameWeight) : 0;
  const weightedMean = coveredWeight > 0 ? round(weightedSum / coveredWeight) : null;
  return { weightedMean, coveredStrata, frameStrata, weightCoverage };
}

export type PeriodStrata = { period: string; assets: StratifiedAsset[] };

/** Minimum frame coverage below which a post-stratified figure is suppressed. */
export const MIN_WEIGHT_COVERAGE = 0.6;

export function buildPostStratTrends(
  periods: PeriodStrata[],
  frame: PopulationFrame,
): PostStratPoint[] {
  const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period));
  let prevMean: number | null = null;
  let prevPeriod: string | null = null;
  return sorted.map((p) => {
    const r = postStratifiedMean(p.assets, frame);
    const suppressed = r.weightedMean == null || r.weightCoverage < MIN_WEIGHT_COVERAGE;
    const weightedMean = suppressed ? null : r.weightedMean;
    const delta = weightedMean != null && prevMean != null ? round(weightedMean - prevMean) : null;
    const point: PostStratPoint = {
      period: p.period,
      previousPeriod: prevPeriod,
      weightedMean,
      delta,
      coveredStrata: r.coveredStrata,
      frameStrata: r.frameStrata,
      weightCoverage: r.weightCoverage,
      suppressed,
    };
    prevPeriod = p.period;
    if (weightedMean != null) prevMean = weightedMean;
    return point;
  });
}
