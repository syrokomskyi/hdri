/*
<MODULE_CONTRACT>
  <purpose>Build a deterministic unstratified availability candidate from every authenticated liveness target.</purpose>
  <non-goals><item>Does not grant publication authority, infer business closure, or estimate population prevalence or longitudinal attrition.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Preserve all four observed outcomes and the complete sealed-target denominator for availability-only preparation.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: A candidate is not a release receipt; missing targets and small cells cannot be hidden by filtering.

import {
  assertVerifiedQuarterExecution,
  readExecutionCasObject,
  type VerifiedQuarterExecution,
} from "@syrokomskyi/factory-core";
import {
  classifyLivenessOutcome,
  LIVENESS_OUTCOME_POLICY_VERSION,
  type LivenessOutcome,
} from "@syrokomskyi/observatory-core";

export type AvailabilityRecord = Readonly<{ assetId: string; outcome: LivenessOutcome }>;
export type AvailabilityScope = Readonly<{ period: string; capsuleId: string; deviceId: string }>;
const OUTCOMES = ["reachable", "unavailable", "blocked", "indeterminate"] as const;

/** Set reconciliation is mandatory even when missing/extra counts cancel out. */
export function summarizeAvailability(
  scope: AvailabilityScope,
  targets: readonly string[],
  records: Iterable<AvailabilityRecord>,
  effectiveK: number,
) {
  if (!/^\d{4}-q[1-4]$/.test(scope.period) || !scope.capsuleId || !scope.deviceId)
    throw new Error("AVAILABILITY_SCOPE_INVALID");
  if (!Number.isSafeInteger(effectiveK) || effectiveK < 1)
    throw new Error("AVAILABILITY_K_INVALID");
  const pending = new Set(targets);
  if (pending.size === 0 || pending.size !== targets.length || targets.some((id) => !id))
    throw new Error("AVAILABILITY_TARGET_SET_INVALID");
  const counts = { reachable: 0, unavailable: 0, blocked: 0, indeterminate: 0 };
  for (const record of records) {
    if (!pending.delete(record.assetId))
      throw new Error("AVAILABILITY_DUPLICATE_OR_OUTSIDE_TARGET");
    if (!OUTCOMES.includes(record.outcome)) throw new Error("AVAILABILITY_OUTCOME_INVALID");
    counts[record.outcome]++;
  }
  if (pending.size) throw new Error(`AVAILABILITY_TARGETS_MISSING:${pending.size}`);
  const n = targets.length;
  const violations = OUTCOMES.filter(
    (outcome) => counts[outcome] > 0 && counts[outcome] < effectiveK,
  ).map((outcome) => `small_outcome_cell:${outcome}`);
  if (n < effectiveK) violations.push("small_target_set");
  return {
    schema: "hdri-availability-candidate@1" as const,
    ...scope,
    status: "candidate-not-approved" as const,
    denominator: "sealed-liveness-targets" as const,
    outcomePolicy: LIVENESS_OUTCOME_POLICY_VERSION,
    n,
    counts,
    reachableShareOfTargets: counts.reachable / n,
    effectiveK,
    cellPrivacy: { status: violations.length ? "fail" : "pass", violations },
    limitations: [
      "Not representative of all businesses or websites.",
      "Blocked and indeterminate observations are not site failures.",
      "No business-closure, industry, attrition or quarter-comparison claims.",
      "Independent reconstruction, scope/time provenance, disclosure review and durable custody remain required.",
    ],
  };
}

/** Authentication belongs to the shared execution verifier, not caller-created lists. */
export async function deriveAvailabilityCandidate(
  capsuleDir: string,
  execution: VerifiedQuarterExecution,
  scope: AvailabilityScope,
  effectiveK: number,
) {
  assertVerifiedQuarterExecution(execution);
  const stages = execution.stages.filter((stage) => stage.stageId === "liveness");
  if (stages.length !== 1 || stages[0]!.collectorId !== scope.deviceId)
    throw new Error("AVAILABILITY_STAGE_SCOPE_MISMATCH");
  const stage = stages[0]!;
  const records: AvailabilityRecord[] = [];
  for (const selected of stage.results) {
    if (selected.key.period !== scope.period || selected.key.capsuleId !== scope.capsuleId)
      throw new Error("AVAILABILITY_TARGET_SCOPE_MISMATCH");
    const evidence = await readExecutionCasObject<{
      schemaVersion: number;
      stage: string;
      provisionalAssetId: string;
      result: { isLive: boolean; httpStatus: number | null; errorCode: string | null };
    }>(capsuleDir, selected.resultSha256);
    const result = evidence.result;
    if (
      evidence.schemaVersion !== 1 ||
      evidence.stage !== "liveness" ||
      evidence.provisionalAssetId !== selected.key.provisionalAssetId ||
      !result ||
      typeof result.isLive !== "boolean" ||
      !(
        result.httpStatus === null ||
        (Number.isInteger(result.httpStatus) &&
          result.httpStatus >= 100 &&
          result.httpStatus <= 999)
      ) ||
      !(result.errorCode === null || typeof result.errorCode === "string")
    )
      throw new Error(`AVAILABILITY_RESULT_INVALID:${selected.resultSha256}`);
    records.push({
      assetId: selected.key.provisionalAssetId,
      outcome: classifyLivenessOutcome(result),
    });
  }
  return {
    ...summarizeAvailability(
      scope,
      stage.results.map((item) => item.key.provisionalAssetId),
      records,
      effectiveK,
    ),
    source: {
      capsuleConfigSha256: execution.capsuleConfigSha256,
      journalSha256: execution.journalSha256,
      targetSetSha256: stage.targetSetSha256,
      selectedResultSetSha256: stage.selectedResultSetSha256,
    },
  };
}
