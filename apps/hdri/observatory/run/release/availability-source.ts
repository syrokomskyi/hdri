/*
<MODULE_CONTRACT>
<purpose>Verify availability-source closure and exact equality of the signed frozen frame and sealed liveness target set.</purpose>
<non-goals><item>Does not assert population coverage, classification accuracy, raw parser completeness or publication admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Use shared signature/closure verifiers and explicit set membership, not count equality or guessed source manifests.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: bind availability source QC to declared capsule frame artifacts and authenticated execution targets.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { assertVerifiedQuarterExecution, assertRelativeArtifactUri, capsuleConfigSha256,
  verifySourceClosure, type QuarterCapsule, type VerifiedQuarterExecution,
  type VerificationKeySource, type HdriPeriod } from "@syrokomskyi/factory-core";

export async function verifyAvailabilitySource(capsuleDir: string, capsule: QuarterCapsule,
  execution: VerifiedQuarterExecution, keys: VerificationKeySource) {
  assertVerifiedQuarterExecution(execution);
  if (execution.capsuleConfigSha256 !== capsuleConfigSha256(capsule.period as HdriPeriod, capsule.capsuleId, capsule.instrumentPlan))
    throw new Error("SOURCE_QC_CAPSULE_CONFIG_MISMATCH");
  const suffix = `source-ledger/projections/frame-${capsule.period}.manifest.json`;
  const declared = capsule.artifacts.filter(entry => entry.stage === "frame" && entry.uri.endsWith(suffix));
  if (declared.length !== 1) throw new Error("SOURCE_QC_FRAME_DECLARATION_AMBIGUOUS");
  const uri = declared[0]!.uri;
  assertRelativeArtifactUri(uri);
  const prefix = uri.slice(0, -`projections/frame-${capsule.period}.manifest.json`.length);
  const closure = await verifySourceClosure(path.join(capsuleDir, prefix), capsule.period, keys);
  for (const [relative, sha256] of closure.artifactSha256) {
    const artifactUri = `${prefix}${relative}`;
    const entries = capsule.artifacts.filter(entry => entry.uri === artifactUri);
    if (entries.length !== 1 || entries[0]!.stage !== "frame" || entries[0]!.sha256 !== sha256)
      throw new Error("SOURCE_QC_ARTIFACT_BINDING_MISMATCH");
    const stat = await fs.lstat(path.join(capsuleDir, artifactUri));
    if (!stat.isFile() || stat.size !== entries[0]!.bytes) throw new Error("SOURCE_QC_ARTIFACT_SIZE_MISMATCH");
  }
  const stages = execution.stages.filter(stage => stage.stageId === "liveness");
  if (stages.length !== 1 || stages[0]!.collectorId !== capsule.deviceId)
    throw new Error("SOURCE_QC_LIVENESS_STAGE_MISMATCH");
  const remaining = new Set<string>(closure.frame.candidateIds);
  if (remaining.size === 0) throw new Error("SOURCE_QC_FRAME_EMPTY");
  for (const result of stages[0]!.results) {
    if (result.key.period !== capsule.period || result.key.capsuleId !== capsule.capsuleId ||
      !remaining.delete(result.key.provisionalAssetId)) throw new Error("SOURCE_QC_TARGET_SET_MISMATCH");
  }
  if (remaining.size !== 0) throw new Error("SOURCE_QC_TARGET_SET_MISMATCH");
  return {
    evidenceSchema: "hdri-availability-source-closure@1" as const,
    candidates: closure.frame.candidateIds.length, targets: stages[0]!.results.length,
    includedBatchIds: [...closure.frame.includedBatchIds],
    frameSha256: closure.frame.frameSha256, ledgerHead: closure.frame.ledgerHead,
    occurrenceProjectionSha256: closure.frame.occurrenceProjectionSha256,
    targetSetSha256: stages[0]!.targetSetSha256,
    capsuleConfigSha256: execution.capsuleConfigSha256, journalSha256: execution.journalSha256,
    artifacts: [...closure.artifactSha256].map(([relative, sha256]) => ({ uri: `${prefix}${relative}`, sha256 })),
  };
}
