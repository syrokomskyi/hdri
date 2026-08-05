/*
<MODULE_CONTRACT>
<purpose>Exports key components and types for managing and running HDRI factory operations.</purpose>
<non-goals>
  <item>Does not implement the internal logic of HDRI processing.</item>
  <item>Does not handle any user interface elements.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for HDRI factory components and types.</item>
  <item>Remove createHdriFactoryEngine export — collapsed into runHdriFactoryEngine.</item>
  <item>Remove withDb export — dead code, 0 consumers.</item>
  <item>Add factory-utils re-exports (moved from @syrokomskyi/observatory-core).</item>
  <item>Export signed source-ledger, cross-process execution and capsule verification contracts.</item>
  <item>Export snapshot-safe source copying and public quarterly execution-closure verification.</item>
  <item>RFC-0030: export prior-capsules contract, discovery, and verification types.</item>
  <item>RFC-0043: export validateBriefConsistency and BriefConsistencyInput from brief-consistency module.</item>
</CHANGE_SUMMARY>
*/

export { HdriFactoryGogol } from "./lib/factory-gogol.js";
export { runHdriFactoryEngine } from "./lib/run-factory-engine.js";
export { createHdriFactoryContext } from "./lib/create-factory-context.js";
export { setupDatabase, writeDbSetupArtifacts, setupFactoryDb } from "./lib/setup-database.js";
export type {
  TableInfo,
  SetupDatabaseOptions,
  SetupDatabaseResult,
  WriteDbSetupArtifactsOptions,
  SetupFactoryDbOptions,
} from "./lib/setup-database.js";

export type {
  HdriFactoryBriefBase,
  HdriFactoryStateBase,
  HdriFactoryContextExtras,
  HdriFactoryContext,
  HdriFactoryGogolArtifacts,
  HdriFactoryPipelineStep,
  HdriFactoryEngineClients,
} from "./lib/types.js";

export {
  createFactoryRelativePathConverter,
  getFactoryRootDir,
  getFactoryPaths,
  getUpstreamOutputRoot,
} from "./lib/factory-utils.js";

export { loadLiveAuditTargets, upsertAuditRun } from "./lib/audit-targets.js";
export type { AuditTarget, AuditRunRow } from "./lib/audit-targets.js";
export {
  assertHdriPeriod,
  assertCapsuleId,
  capsuleConfigSha256,
  assertRelativeArtifactUri,
  canonicalResumeKey,
  isTerminalWorkState,
  profileEligible,
  sourceOccurrenceId,
  KNOWN_INSTRUMENTS,
  DEFAULT_INSTRUMENT_PLAN,
  validateInstrumentPlan,
  parseInstrumentPlanFromFrontmatter,
} from "./lib/quarter-contracts.js";
export {
  assertFrozenFrameIntegrity,
  freezeFrame,
  frozenFrameSha256,
  isSameAcceptedBatch,
} from "./lib/source-ledger.js";
export {
  checkSourceBatch,
  copyVerifiedArtifact,
  publishFrozenFrameProjection,
  readSourceBatchManifests,
  rebuildLedgerHead,
  sealFrameManifest,
  sealSourceBatch,
  verifySignedLedgerManifest,
  verifySourceClosure,
} from "./lib/source-ledger-store.js";
export type { SignedLedgerManifest, VerificationKeySource } from "./lib/source-ledger-store.js";
export type { FrozenFrame, SourceDisposition, SourceOccurrence } from "./lib/source-ledger.js";
export { assertStageComplete, selectTerminalResult } from "./lib/execution-journal.js";
export type { Attempt, TerminalResult } from "./lib/execution-journal.js";
export {
  assertExecutionEvidenceMatchesWorkKey,
  ExecutionEventStore,
  QuarterExecutionJournal,
  executionEventSha256,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  rebuildExecution,
  verifyQuarterExecutionClosure,
  verifySignedStageSeal,
  withLeaseHeartbeat,
  workKeyId,
  writeExecutionCasObject,
} from "./lib/execution-store.js";
export type {
  ExecutionEvidenceEnvelope,
  ExecutionEvent,
  RebuiltExecution,
  RebuiltWork,
  SignedStageSeal,
  StartedAttempt,
} from "./lib/execution-store.js";
export {
  sealQuarterCapsule,
  validateCapsule,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  writeQuarterCapsuleCandidate,
  writeQuarterCapsuleStaging,
  extractBatchIdsFromManifest,
  extractSourceLedgerHead,
} from "./lib/capsule.js";
export type {
  CapsuleArtifact,
  CapsuleSignature,
  InstrumentPlanEntry,
  QuarterCapsule,
} from "./lib/capsule.js";
export type {
  CapsuleId,
  HdriPeriod,
  InstrumentId,
  ProvisionalAssetId,
  SourceBatchId,
  SourceBatchManifest,
  SourceOccurrenceId,
  WorkKey,
  WorkState,
} from "./lib/quarter-contracts.js";
export {
  discoverPriorCapsules,
  parsePriorCapsulesFile,
  readPriorCapsulesFile,
  verifyPriorCapsule,
} from "./lib/prior-capsules.js";
export type {
  LedgerDiscoveryResult,
  PriorCapsuleEntry,
  PriorCapsuleRef,
  PriorCapsuleVerificationResult,
  PriorCapsulesFile,
} from "./lib/prior-capsules.js";
export { validateBriefConsistency } from "./lib/brief-consistency.js";
export type { BriefConsistencyInput } from "./lib/brief-consistency.js";
