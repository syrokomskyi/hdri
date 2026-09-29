/*
<MODULE_CONTRACT>
<purpose>Verify retained availability reconciliation against explicitly pinned candidate, bundle manifest and policy bytes.</purpose>
<non-goals><item>Does not rerun observation verification, authenticate pin provenance or grant release admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Reuse completed target-level comparison only under explicit byte pins and matching scope, selection, counts and bundle identity.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: consume completed availability comparison without inventing score inputs or repeating collection.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { serializeReconciledAvailabilityPreview } from "./availability-preview";

type PinnedFile = Readonly<{ path: string; sha256: string }>;
export type RetainedAvailabilityInputs = Readonly<{
  period: string;
  capsuleId: string;
  candidate: PinnedFile;
  comparison: PinnedFile;
  bundleManifest: PinnedFile;
  policy: PinnedFile;
}>;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function readPinned(file: PinnedFile): Promise<Buffer> {
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("RECONCILIATION_PIN_INVALID");
  const handle = await fs.open(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 4 * 1024 * 1024)
      throw new Error("RECONCILIATION_INPUT_INVALID");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length !== before.size || before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || sha256(bytes) !== file.sha256)
      throw new Error("RECONCILIATION_INPUT_DIGEST_MISMATCH");
    return bytes;
  } finally {
    await handle.close();
  }
}

/** A retained-record audit, not a fresh execution or authority for caller-supplied pins. */
export async function verifyRetainedAvailabilityReconciliation(input: RetainedAvailabilityInputs) {
  const files = [input.candidate, input.comparison, input.bundleManifest, input.policy];
  const [candidateBytes, comparisonBytes, bundleBytes, policyBytes] = await Promise.all(files.map(readPinned));
  const candidate = JSON.parse(candidateBytes!.toString("utf8"));
  const comparison = JSON.parse(comparisonBytes!.toString("utf8"));
  const bundle = JSON.parse(bundleBytes!.toString("utf8"));
  const policy = parse(policyBytes!.toString("utf8"));
  if (!policy || !Number.isSafeInteger(policy.default_k) || policy.default_k < 1 ||
    !Number.isSafeInteger(policy.hard_floor) || policy.hard_floor < 1 || typeof policy.high_risk_release !== "boolean")
    throw new Error("RECONCILIATION_POLICY_INVALID");
  const effectiveK = policy.high_risk_release ? policy.default_k : Math.max(policy.default_k, policy.hard_floor);
  serializeReconciledAvailabilityPreview(candidate, comparison, effectiveK, input.policy.sha256);
  if (candidate.period !== input.period || candidate.capsuleId !== input.capsuleId ||
    !bundle || bundle.period !== input.period || bundle.run_id !== input.capsuleId ||
    bundle.bundle_hash !== comparison.bundleHash || bundle.observation_count !== comparison.bundleObservationsScanned ||
    bundle.asset_state_count !== comparison.targets)
    throw new Error("RECONCILIATION_BUNDLE_OR_SCOPE_MISMATCH");
  if (!Array.isArray(bundle.observation_partitions) || !bundle.observation_partitions.length)
    throw new Error("RECONCILIATION_PARTITIONS_INVALID");
  let partitionRows = 0;
  const uris = new Set<string>();
  for (const part of bundle.observation_partitions) {
    if (!part || typeof part.uri !== "string" || !/^observations\/part-\d+\.ndjson$/.test(part.uri) ||
      uris.has(part.uri) || !Number.isSafeInteger(part.row_count) || part.row_count < 1 ||
      typeof part.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(part.sha256))
      throw new Error("RECONCILIATION_PARTITIONS_INVALID");
    uris.add(part.uri);
    partitionRows += part.row_count;
  }
  if (!Number.isSafeInteger(partitionRows) || partitionRows !== comparison.bundleObservationsScanned)
    throw new Error("RECONCILIATION_PARTITION_COUNT_MISMATCH");
  // Recheck names as well as open handles before issuing the audit result.
  await Promise.all(files.map(readPinned));
  return {
    evidenceSchema: "hdri-retained-availability-reconciliation@1" as const,
    applicability: ["availability"] as const,
    verificationMode: "pinned-completed-comparison-not-reexecution" as const,
    bindings: {
      candidateSha256: input.candidate.sha256,
      comparisonSha256: input.comparison.sha256,
      bundleManifestSha256: input.bundleManifest.sha256,
      policySha256: input.policy.sha256,
      bundleHash: comparison.bundleHash as string,
      targetSetSha256: comparison.targetSetSha256 as string,
      selectedResultSetSha256: comparison.selectedResultSetSha256 as string,
    },
    targets: comparison.targets as number,
    observationsCompared: comparison.observationsCompared as number,
    bundleObservationsScanned: comparison.bundleObservationsScanned as number,
    counts: comparison.counts as Record<string, number>,
  };
}
