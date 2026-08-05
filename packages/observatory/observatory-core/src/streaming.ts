/*
<MODULE_CONTRACT>
<purpose>Defines deterministic observation identity and bounded partition checkpoints for HDRI streaming.</purpose>
<non-goals><item>Does not serialize Parquet or perform unbounded buffering.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0027 makes post-capture processing restart-safe.</item></CHANGE_SUMMARY>
*/

import { sha256 } from "./hashing.js";

export type ObservationKeyInput = Readonly<{
  period: string;
  capsuleId: string;
  provisionalAssetId: string;
  signalPath: string;
  sourceResultSha256: string;
  extractorVersion: string;
}>;

export const observationKey = (input: ObservationKeyInput): string =>
  sha256([
    "hdri:observation:v1",
    input.period,
    input.capsuleId,
    input.provisionalAssetId,
    input.signalPath,
    input.sourceResultSha256,
    input.extractorVersion,
  ].join("\0"));

export type StreamCheckpoint = Readonly<{
  partition: number;
  lastSortKey: string | null;
  rowsWritten: number;
  partitionSha256: string | null;
}>;

export const canCommitCheckpoint = (checkpoint: StreamCheckpoint): boolean =>
  checkpoint.partition >= 0 && checkpoint.rowsWritten >= 0 && checkpoint.partitionSha256 !== null;
