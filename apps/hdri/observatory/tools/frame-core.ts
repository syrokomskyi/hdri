/*
<MODULE_CONTRACT>
<purpose>Make the WP4 post-stratification frame production-ready and self-validating (WP16, (d)):
pure checks of an operator-supplied population-frame against the strata that actually appear in the
published data, plus a template keyed by those real strata. Post-stratification is the biggest lever
for turning "who we crawled" into "German Handwerk", but it is only trustworthy if the frame's keys
match the data and it covers enough of the population — this core proves both without ever inventing
a weight.</purpose>
<non-goals>
  <item>Reads nothing and invents nothing — the caller supplies the frame + the sampled strata.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 (d): population-frame validator + template core for post-stratification readiness.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import { MIN_WEIGHT_COVERAGE, type PopulationFrame } from "./poststrat-core";

export { MIN_WEIGHT_COVERAGE };

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

  const projectedWeightCoverage =
    totalPositiveWeight > 0 ? Math.round((coveredWeight / totalPositiveWeight) * 1000) / 1000 : 0;
  const meetsThreshold = projectedWeightCoverage >= MIN_WEIGHT_COVERAGE;

  return {
    sampleStrata: sampleStrata.size,
    positiveFrameStrata: positiveKeys.size,
    coveredStrata,
    projectedWeightCoverage,
    meetsThreshold,
    missingInFrame,
    unknownInFrame,
    invalidWeights,
    ok: meetsThreshold && invalidWeights.length === 0 && positiveKeys.size > 0,
  };
}

/**
 * Builds an all-zero frame template keyed by the real sampled strata (sorted), so the operator
 * fills counts against the actual data universe — every key is guaranteed to match the exporter's
 * `${bundesland}|${destatis_group}` form. Preserves the shipped instructional metadata.
 */
export function buildTemplateFrame(
  sampleStrata: Iterable<string>,
  meta?: { strataSystem?: string; source?: string },
): PopulationFrame & { _instructions: string } {
  const weights: Record<string, number> = {};
  for (const key of [...sampleStrata].sort()) weights[key] = 0;
  return {
    _instructions:
      "TEMPLATE generated from the published sample's real strata. Copy to " +
      ".input/population-frame.json and replace every 0 with the real number of Handwerk " +
      "businesses in that stratum (Destatis/ZDH Handwerkszählung). Keys are " +
      "`<bundesland>|<destatis_group>` matching asset_states.bundesland and " +
      "asset_hwo_mappings.target_code. The post-stratified series is suppressed unless covered " +
      `frame weight >= ${MIN_WEIGHT_COVERAGE * 100}%. While all weights are 0 no numbers are produced.`,
    strataSystem: meta?.strataSystem ?? "bundesland|destatis_group",
    source: meta?.source ?? "TEMPLATE — replace with real Destatis Handwerkszählung counts",
    weights,
  } as PopulationFrame & { _instructions: string };
}
