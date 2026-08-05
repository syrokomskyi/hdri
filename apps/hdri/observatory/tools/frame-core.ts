/*
<MODULE_CONTRACT>
<purpose>Make the WP4 post-stratification frame production-ready and self-validating (WP16, (d)):
pure checks of an operator-supplied population-frame against the strata that actually appear in the
published data. Post-stratification is the biggest lever
for turning "who we crawled" into "German Handwerk", but it is only trustworthy if the frame's keys
match the data and it covers enough of the population — this core proves both without ever inventing
a weight.</purpose>
<non-goals>
  <item>Reads nothing and invents nothing — the caller supplies the frame + the sampled strata.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0029: complete-frame validator for post-stratification readiness.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import {
  MIN_DIMENSION_COVERAGE,
  MIN_WEIGHT_COVERAGE,
  type PopulationFrame,
} from "./poststrat-core";

export { MIN_DIMENSION_COVERAGE, MIN_WEIGHT_COVERAGE };

export type FrameValidation = {
  /** Distinct strata that appear in the published sample. */
  sampleStrata: number;
  /** Frame keys with a positive weight. */
  positiveFrameStrata: number;
  /** Sampled strata that also have a positive frame weight (the reweightable set). */
  coveredStrata: number;
  /**
   * Projected weightCoverage buildPostStratTrends would see for this sample:
   * covered positive frame weight / total positive frame weight (0..1).
   */
  projectedWeightCoverage: number;
  /** Lowest covered population-weight share among the 16 Bundesländer. */
  minimumBundeslandCoverage: number;
  /** Lowest covered population-weight share among the seven Destatis groups. */
  minimumGroupCoverage: number;
  /** True when the projected coverage clears the suppression threshold. */
  meetsThreshold: boolean;
  /** Sampled strata absent from the frame (or zero-weighted) — they cannot be reweighted. */
  missingInFrame: Array<{ key: string; sampleN: number }>;
  /** Positive-weight frame keys that never appear in the sample — likely typos or dead cells. */
  unknownInFrame: string[];
  /** Frame keys whose weight is non-positive or not a finite number. */
  invalidWeights: string[];
  /** True when the frame is structurally usable (matches data, clears threshold, no invalid weights). */
  ok: boolean;
};

/**
 * Validates a population frame against the strata actually present in the published sample.
 * `sampleStrata` maps each `${bundesland}|${destatis_group}` key to its sampled asset count.
 * Purely structural + coverage — it never fabricates a weight and never mutates the frame.
 */
export function validateFrame(
  frame: PopulationFrame,
  sampleStrata: ReadonlyMap<string, number>,
): FrameValidation {
  const positiveKeys = new Set<string>();
  const invalidWeights: string[] = [];
  for (const [key, w] of Object.entries(frame.weights)) {
    // 0 is the legitimate "unfilled cell" sentinel — valid, just not a positive weight.
    // Only a negative or non-finite (NaN/Infinity, e.g. a typo'd "12a") weight is an error.
    if (!Number.isFinite(w) || w < 0) {
      invalidWeights.push(key);
      continue;
    }
    if (w > 0) positiveKeys.add(key);
  }

  let totalPositiveWeight = 0;
  for (const key of positiveKeys) totalPositiveWeight += frame.weights[key]!;

  let coveredWeight = 0;
  let coveredStrata = 0;
  const missingInFrame: Array<{ key: string; sampleN: number }> = [];
  for (const [key, sampleN] of sampleStrata) {
    if (positiveKeys.has(key)) {
      coveredWeight += frame.weights[key]!;
      coveredStrata += 1;
    } else {
      missingInFrame.push({ key, sampleN });
    }
  }
  missingInFrame.sort((a, b) => b.sampleN - a.sampleN || a.key.localeCompare(b.key));

  const unknownInFrame = [...positiveKeys].filter((k) => !sampleStrata.has(k)).sort();

  const dimensionWeights = new Map<string, { total: number; covered: number }>();
  for (const key of positiveKeys) {
    const weight = frame.weights[key]!;
    const [bundesland, group, ...extra] = key.split("|");
    if (!bundesland || !group || extra.length > 0) {
      invalidWeights.push(key);
      continue;
    }
    for (const dimension of [`land:${bundesland}`, `group:${group}`]) {
      const current = dimensionWeights.get(dimension) ?? { total: 0, covered: 0 };
      current.total += weight;
      if (sampleStrata.has(key)) current.covered += weight;
      dimensionWeights.set(dimension, current);
    }
  }
  const minimumCoverage = (prefix: string): number => {
    const values = [...dimensionWeights.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value.covered / value.total);
    return values.length > 0 ? Math.min(...values) : 0;
  };
  const minimumBundeslandCoverage = minimumCoverage("land:");
  const minimumGroupCoverage = minimumCoverage("group:");

  const projectedWeightCoverage =
    totalPositiveWeight > 0 ? Math.round((coveredWeight / totalPositiveWeight) * 1000) / 1000 : 0;
  const meetsThreshold = projectedWeightCoverage >= MIN_WEIGHT_COVERAGE;

  return {
    sampleStrata: sampleStrata.size,
    positiveFrameStrata: positiveKeys.size,
    coveredStrata,
    projectedWeightCoverage,
    minimumBundeslandCoverage,
    minimumGroupCoverage,
    meetsThreshold,
    missingInFrame,
    unknownInFrame,
    invalidWeights,
    ok:
      meetsThreshold &&
      minimumBundeslandCoverage >= MIN_DIMENSION_COVERAGE &&
      minimumGroupCoverage >= MIN_DIMENSION_COVERAGE &&
      invalidWeights.length === 0 &&
      positiveKeys.size > 0,
  };
}
