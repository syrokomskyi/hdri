/*
<MODULE_CONTRACT>
  <purpose>Independently reconcile the signed availability projection against authenticated selected raw liveness results.</purpose>
  <non-goals><item>Does not certify unrelated signals, measurement-time provenance, public disclosure, custody or publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: compare every target, typed value and evidence reference rather than aggregate counts alone.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Exhaust both required signal sets and the whole bundle stream before returning comparison evidence.

import {
  assertVerifiedQuarterExecution,
  readExecutionCasObject,
  type VerifiedQuarterExecution,
} from "@syrokomskyi/factory-core";
import {
  classifyLivenessOutcome,
  type LivenessOutcome,
  type Observation,
} from "@syrokomskyi/observatory-core";
import {
  verifyObservation,
  type SignedObservation,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import { readEmitBundle, streamObservations } from "@syrokomskyi/observatory-emit";
import type { AvailabilityScope } from "./availability-candidate";

export type ExpectedAvailability = Readonly<{
  assetId: string;
  outcome: LivenessOutcome;
  isReachable: boolean;
  sourceHash: string;
}>;

/** A comparison seam, not an admission API: expected records must be independently authenticated by the caller. */
export async function compareAvailabilityObservations(
  scope: AvailabilityScope,
  expected: readonly ExpectedAvailability[],
  observations: AsyncIterable<Observation> | Iterable<Observation>,
  keys: ReadonlyMap<string, VerificationKey>,
) {
  const raw = new Map(expected.map((record) => [record.assetId, record]));
  if (!raw.size || raw.size !== expected.length)
    throw new Error("AVAILABILITY_EXPECTED_SET_INVALID");
  const pendingOutcome = new Set(raw.keys());
  const pendingReachable = new Set(raw.keys());
  const ids = new Set<string>();
  const counts = { reachable: 0, unavailable: 0, blocked: 0, indeterminate: 0 };
  const match = /^(\d{4})-q([1-4])$/.exec(scope.period);
  if (!match) throw new Error("AVAILABILITY_SCOPE_INVALID");
  const month = (Number(match[2]) - 1) * 3;
  const start = Date.UTC(Number(match[1]), month, 1);
  const end = Date.UTC(Number(match[1]), month + 3, 1);
  let scanned = 0;
  for await (const observation of observations) {
    scanned++;
    const outcomeSignal = observation.signal_path === "availability.website.outcome";
    if (!outcomeSignal && observation.signal_path !== "availability.website.is_reachable") continue;
    const expectedRecord = raw.get(observation.asset_id);
    const pending = outcomeSignal ? pendingOutcome : pendingReachable;
    if (!expectedRecord || !pending.delete(observation.asset_id))
      throw new Error("AVAILABILITY_PROJECTION_DUPLICATE_OR_OUTSIDE_TARGET");
    if (ids.has(observation.observation_id))
      throw new Error("AVAILABILITY_OBSERVATION_ID_DUPLICATE");
    ids.add(observation.observation_id);
    const signed = observation as SignedObservation;
    const key = keys.get(signed.signing_key_id);
    if (!key || key.collectorId !== scope.deviceId || !verifyObservation(signed, key))
      throw new Error("AVAILABILITY_OBSERVATION_SIGNATURE_INVALID");
    const observed = Date.parse(observation.observed_at);
    if (
      !Number.isFinite(observed) ||
      observed < start ||
      observed >= end ||
      observation.crawl_hash !== scope.capsuleId ||
      observation.status !== "active" ||
      observation.superseded_by !== null ||
      observation.deprecated_reason !== null
    )
      throw new Error("AVAILABILITY_OBSERVATION_SCOPE_INVALID");
    if (
      observation.source_hash !== expectedRecord.sourceHash ||
      observation.evidence_ref !==
        `staging/execution/cas/${expectedRecord.sourceHash.slice(0, 2)}/${expectedRecord.sourceHash}.json`
    )
      throw new Error("AVAILABILITY_OBSERVATION_SOURCE_MISMATCH");
    if (
      observation.value_num !== null ||
      observation.value_json !== null ||
      (outcomeSignal
        ? observation.value_type !== "str" ||
          observation.value_bool !== null ||
          observation.value_str !== expectedRecord.outcome
        : observation.value_type !== "bool" ||
          observation.value_str !== null ||
          observation.value_bool !== expectedRecord.isReachable)
    )
      throw new Error("AVAILABILITY_OBSERVATION_VALUE_MISMATCH");
    if (outcomeSignal) counts[expectedRecord.outcome]++;
  }
  if (pendingOutcome.size || pendingReachable.size)
    throw new Error("AVAILABILITY_PROJECTION_INCOMPLETE");
  return {
    status: "projection-matched-not-release-proof" as const,
    targets: raw.size,
    observationsCompared: ids.size,
    bundleObservationsScanned: scanned,
    counts,
  };
}

export async function reconcileAvailabilityBundle(
  capsuleDir: string,
  execution: VerifiedQuarterExecution,
  emitDir: string,
  scope: AvailabilityScope,
  keys: ReadonlyMap<string, VerificationKey>,
) {
  assertVerifiedQuarterExecution(execution);
  const stages = execution.stages.filter((stage) => stage.stageId === "liveness");
  if (stages.length !== 1 || stages[0]!.collectorId !== scope.deviceId)
    throw new Error("AVAILABILITY_STAGE_SCOPE_MISMATCH");
  const stage = stages[0]!;
  const expected: ExpectedAvailability[] = [];
  for (const selected of stage.results) {
    if (selected.key.period !== scope.period || selected.key.capsuleId !== scope.capsuleId)
      throw new Error("AVAILABILITY_TARGET_SCOPE_MISMATCH");
    const evidence = await readExecutionCasObject<{
      result: { isLive: boolean; httpStatus: number | null; errorCode: string | null };
    }>(capsuleDir, selected.resultSha256);
    const attempt = evidence.result;
    if (
      !attempt ||
      typeof attempt.isLive !== "boolean" ||
      !(
        attempt.httpStatus === null ||
        (Number.isInteger(attempt.httpStatus) &&
          attempt.httpStatus >= 100 &&
          attempt.httpStatus <= 999)
      ) ||
      !(attempt.errorCode === null || typeof attempt.errorCode === "string")
    )
      throw new Error("AVAILABILITY_RAW_RESULT_INVALID");
    expected.push({
      assetId: selected.key.provisionalAssetId,
      sourceHash: selected.resultSha256,
      isReachable: attempt.isLive,
      outcome: classifyLivenessOutcome(attempt),
    });
  }
  const bundle = await readEmitBundle(emitDir);
  if (bundle.manifest.period !== scope.period || bundle.manifest.run_id !== scope.capsuleId)
    throw new Error("AVAILABILITY_BUNDLE_SCOPE_MISMATCH");
  const result = await compareAvailabilityObservations(
    scope,
    expected,
    streamObservations(bundle),
    keys,
  );
  return {
    schema: "hdri-availability-reconciliation@1",
    ...scope,
    ...result,
    targetSetSha256: stage.targetSetSha256,
    selectedResultSetSha256: stage.selectedResultSetSha256,
    bundleHash: bundle.manifest.bundle_hash,
    limitations: [
      "No authenticity claim for non-availability signals.",
      "Caller-supplied keys do not establish publication admission.",
      "Observed timestamps are range-checked, not independently reconstructed.",
    ],
  };
}
