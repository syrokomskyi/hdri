/*
<MODULE_CONTRACT>
<purpose>Builds deterministic immutable HDRI source-ledger projections without mutable database row identifiers.</purpose>
<non-goals><item>Does not parse raw source files or decide website availability.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0024 adds forward-only assertions, corrections and frozen frames.</item>
  <item>Bind frozen frames to included batches, ledger head and occurrence projection hash.</item>
  <item>Expose versioned derived-frame integrity verification for independent consumers.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { HdriPeriod, ProvisionalAssetId, SourceBatchId, SourceOccurrenceId } from "./quarter-contracts.js";

export type SourceDisposition = "assertion" | "correction" | "retraction";

export type SourceOccurrence = Readonly<{
  sourceOccurrenceId: SourceOccurrenceId;
  batchId: SourceBatchId;
  periodAdded: HdriPeriod;
  provisionalAssetId: ProvisionalAssetId;
  normalisedDomain: string;
  disposition: SourceDisposition;
  correctionOf?: SourceOccurrenceId;
}>;

export type FrozenFrame = Readonly<{
  period: HdriPeriod;
  candidateIds: readonly ProvisionalAssetId[];
  includedBatchIds: readonly SourceBatchId[];
  ledgerHead: string;
  occurrenceProjectionSha256: string;
  frameSha256: string;
}>;

export const frozenFrameSha256 = (
  frame: Omit<FrozenFrame, "frameSha256">,
): string => createHash("sha256")
  .update(`hdri:frame:v2\0${frame.period}\0${frame.ledgerHead}\0${frame.occurrenceProjectionSha256}\0${frame.includedBatchIds.join("\0")}\0${frame.candidateIds.join("\0")}`)
  .digest("hex");

export const assertFrozenFrameIntegrity = (frame: FrozenFrame): void => {
  if (canonicalSortedUnique(frame.candidateIds).join("\0") !== frame.candidateIds.join("\0")) {
    throw new Error(`Frame ${frame.period} candidate IDs are not sorted and unique`);
  }
  if (canonicalSortedUnique(frame.includedBatchIds).join("\0") !== frame.includedBatchIds.join("\0")) {
    throw new Error(`Frame ${frame.period} batch IDs are not sorted and unique`);
  }
  const { frameSha256, ...unsigned } = frame;
  if (frozenFrameSha256(unsigned) !== frameSha256) throw new Error(`Frame ${frame.period} derived hash mismatch`);
};

const canonicalSortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

/**
 * Retractions affect provenance attributes, never the durable candidate universe.
 * An asset remains a frame candidate once an accepted assertion introduced it.
 */
export const freezeFrame = (
  period: HdriPeriod,
  occurrences: readonly SourceOccurrence[],
  closure: Readonly<{ ledgerHead: string; occurrenceProjectionSha256: string; includedBatchIds?: readonly SourceBatchId[] }>,
): FrozenFrame => {
  const ids = [...new Set(occurrences
    .filter((occurrence) => occurrence.disposition === "assertion")
    .map((occurrence) => occurrence.provisionalAssetId))].sort();
  const includedBatchIds = [...new Set(closure.includedBatchIds ?? occurrences.map((occurrence) => occurrence.batchId))].sort();
  const unsigned = {
    period,
    candidateIds: ids,
    includedBatchIds,
    ledgerHead: closure.ledgerHead,
    occurrenceProjectionSha256: closure.occurrenceProjectionSha256,
  };
  return { ...unsigned, frameSha256: frozenFrameSha256(unsigned) };
};

export const isSameAcceptedBatch = (
  known: Readonly<{ batchId: SourceBatchId; batchHash: string }> | undefined,
  incoming: Readonly<{ batchId: SourceBatchId; batchHash: string }>,
): "new" | "already-sealed" | "conflict" => {
  if (!known) return "new";
  return known.batchHash === incoming.batchHash ? "already-sealed" : "conflict";
};
