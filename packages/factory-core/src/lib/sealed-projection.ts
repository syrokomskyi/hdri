/*
<MODULE_CONTRACT>
<purpose>Defines the unified commit-attempt input and sealed projection contracts that bind HDRI producers to one fenced durable authority (RFC-0114).</purpose>
<non-goals>
  <item>Does not perform network work or own stage-specific error classification.</item>
  <item>Does not replace the CAS object store for binary evidence blobs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0114: introduce CommitAttemptInput and SealedProjection types for unified collector execution and snapshot authority.</item>
</CHANGE_SUMMARY>
*/

export type CommitAttemptInput = Readonly<{
  workKeyId: string;
  attemptId: string;
  epoch: number;
  measuredAt: string;
  inputFingerprint: string;
  evidence: readonly { role: string; sha256: string; bytes: number }[];
  outcome: "succeeded" | "unavailable" | "excluded" | "failed";
}>;

export type SealedProjection = Readonly<{
  stageId: string;
  deviceId: string;
  expectedWorkSetSha256: string;
  terminalWorkSetSha256: string;
  selectedResultSetSha256: string;
  projectionSha256: string;
  snapshotRef: { uri: string; sha256: string; bytes: number };
}>;
