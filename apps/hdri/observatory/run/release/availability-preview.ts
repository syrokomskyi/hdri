/*
<MODULE_CONTRACT>
  <purpose>Serialize a four-outcome availability aggregate into deterministic, identity-free preview bytes.</purpose>
  <non-goals><item>Does not authenticate input, perform full disclosure review, create a public manifest or authorize publication.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Introduce explicit availability schema v2 without reinterpreting historical binary products.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Keep all four outcome cells and the complete target denominator; never turn uncertainty into failure.
import { LIVENESS_OUTCOME_POLICY_VERSION } from "@syrokomskyi/observatory-core";

const OUTCOMES = ["reachable", "unavailable", "blocked", "indeterminate"] as const;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AVAILABILITY_PREVIEW_OBJECT_REQUIRED");
  return value as Record<string, unknown>;
};

/** Consistency of retained private reports is not authentication or publication admission. */
export function serializeReconciledAvailabilityPreview(
  input: unknown, comparison: unknown, effectiveK: number, policySha256: string,
) {
  const candidate = record(input);
  const report = record(comparison);
  const source = record(candidate.source);
  const counts = record(candidate.counts);
  const comparedCounts = record(report.counts);
  if (!/^[a-f0-9]{64}$/.test(policySha256) || candidate.policySha256 !== policySha256)
    throw new Error("AVAILABILITY_PREVIEW_POLICY_DIGEST_MISMATCH");
  if (report.schema !== "hdri-availability-reconciliation@1" ||
    report.status !== "projection-matched-not-release-proof" ||
    ["period", "capsuleId", "deviceId"].some(key =>
      typeof candidate[key] !== "string" || !candidate[key] || candidate[key] !== report[key]) ||
    ["targetSetSha256", "selectedResultSetSha256"].some(key =>
      typeof source[key] !== "string" || !/^[a-f0-9]{64}$/.test(source[key]) || source[key] !== report[key]) ||
    report.targets !== candidate.n ||
    typeof candidate.n !== "number" || report.observationsCompared !== candidate.n * 2 ||
    typeof report.bundleObservationsScanned !== "number" ||
    !Number.isSafeInteger(report.bundleObservationsScanned) || report.bundleObservationsScanned < candidate.n * 2 ||
    typeof report.bundleHash !== "string" || !/^[a-f0-9]{64}$/.test(report.bundleHash) ||
    Object.keys(comparedCounts).length !== OUTCOMES.length ||
    OUTCOMES.some(key => counts[key] !== comparedCounts[key]))
    throw new Error("AVAILABILITY_PREVIEW_RECONCILIATION_MISMATCH");
  return serializeAvailabilityPreview(input, effectiveK);
}

/** effectiveK must come from the caller's retained policy, never from the candidate. */
export function serializeAvailabilityPreview(input: unknown, effectiveK: number) {
  const candidate = record(input);
  if (!Number.isSafeInteger(effectiveK) || effectiveK < 1)
    throw new Error("AVAILABILITY_PREVIEW_POLICY_INVALID");
  if (
    candidate.schema !== "hdri-availability-candidate@1" ||
    candidate.status !== "candidate-not-approved" ||
    typeof candidate.period !== "string" || !/^\d{4}-q[1-4]$/.test(candidate.period) ||
    candidate.denominator !== "sealed-liveness-targets" ||
    candidate.outcomePolicy !== LIVENESS_OUTCOME_POLICY_VERSION ||
    candidate.effectiveK !== effectiveK
  ) throw new Error("AVAILABILITY_PREVIEW_CONTRACT_MISMATCH");
  const counts = record(candidate.counts);
  if (Object.keys(counts).length !== OUTCOMES.length ||
    Object.keys(counts).some(key => !OUTCOMES.includes(key as typeof OUTCOMES[number])))
    throw new Error("AVAILABILITY_PREVIEW_OUTCOMES_INVALID");
  const values = OUTCOMES.map(outcome => {
    const value = counts[outcome];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new Error("AVAILABILITY_PREVIEW_COUNT_INVALID");
    if (value > 0 && value < effectiveK)
      throw new Error("AVAILABILITY_PREVIEW_SMALL_CELL");
    return value;
  });
  const n = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(n) || n < effectiveK || n !== candidate.n)
    throw new Error("AVAILABILITY_PREVIEW_DENOMINATOR_INVALID");
  const share = values[0]! / n;
  if (candidate.reachableShareOfTargets !== share)
    throw new Error("AVAILABILITY_PREVIEW_RATE_MISMATCH");
  // Explicit projection, never spread private candidate/source fields into output.
  const row = {
    period: candidate.period,
    n,
    reachable: values[0]!,
    unavailable: values[1]!,
    blocked: values[2]!,
    indeterminate: values[3]!,
    reachable_share_of_targets: share,
  };
  const schemaId = "hdri-public-availability@2" as const;
  const json = `${JSON.stringify({
    schema: schemaId,
    denominator: "sealed-liveness-targets",
    outcome_policy: LIVENESS_OUTCOME_POLICY_VERSION,
    interpretation: [
      "Reachability follows the retained probe policy, not successful page delivery or quarter-long uptime.",
      "Blocked and indeterminate results are distinct from unavailable results and remain in the denominator.",
      "Describes measured targets only; no population, industry, business-closure or quarter-comparison inference.",
    ],
    rows: [row],
  }, null, 2)}\n`;
  const csv = `${Object.keys(row).join(",")}\n${Object.values(row).join(",")}\n`;
  return { status: "preview-not-approved" as const, schemaId, json, csv };
}
