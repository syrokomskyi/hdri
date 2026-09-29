/*
<MODULE_CONTRACT>
<purpose>Exports key components and types for managing and running HDRI factory operations.</purpose>
<non-goals>
  <item>Does not implement the internal logic of HDRI processing.</item>
  <item>Does not handle any user interface elements.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 B5: expose authenticated immutable selected execution results to source consumers.</item>
  <item>Initial export setup for HDRI factory components and types.</item>
  <item>Remove createHdriFactoryEngine export — collapsed into runHdriFactoryEngine.</item>
  <item>Remove withDb export — dead code, 0 consumers.</item>
  <item>Add factory-utils re-exports (moved from @syrokomskyi/observatory-core).</item>
  <item>Export signed source-ledger, cross-process execution and capsule verification contracts.</item>
  <item>Export snapshot-safe source copying and public quarterly execution-closure verification.</item>
  <item>RFC-0030: export prior-capsules contract, discovery, and verification types.</item>
  <item>RFC-0043: export validateBriefConsistency and BriefConsistencyInput from brief-consistency module.</item>
  <item>Export quarter-scoped upstream DB and stable target identity guards.</item>
  <item>RFC-0099: export ProgramGate contract and fail-closed decision function.</item>
  <item>RFC-0112: export QuarterRecord and ReadinessReceipt contracts for quarterly continuity.</item>
  <item>RFC-0113: export AdmissionInput, EvidenceRef, EvidenceScope types and verification function.</item>
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
  INSTRUMENT_SEAL_STAGES,
  sealStagesFor,
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
export { verifyInheritedSourceBatch } from "./lib/verify-inherited-batch.js";
export type { InheritedBatchVerification, InheritedSeedRow } from "./lib/verify-inherited-batch.js";
export {
  assertStageComplete,
  selectTerminalResult,
  reconcileTerminalSet,
} from "./lib/execution-journal.js";
export type { Attempt, TerminalResult, ReconciledSet } from "./lib/execution-journal.js";
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
  loadVerifiedQuarterExecution,
  assertVerifiedQuarterExecution,
  verifySignedStageSeal,
  withLeaseHeartbeat,
  workKeyId,
  writeExecutionCasObject,
  commitAttempt,
  sealedProjection,
  createExecutionDb,
  executionDbPath,
  openExecutionDb,
  appendOrderedEvent,
  readOrderedEvents,
  allocateLeaseEpoch,
  verifyLeaseEpoch,
  releaseLeaseEpoch,
  writeMeasurementEvidence,
  readMeasurementEvidence,
  compactJournalSegment,
  readJournalSegment,
  measurementEvidenceForWorkKey,
  declareStageTargetSet,
} from "./lib/execution-store.js";
export type { VerifiedQuarterExecution, VerifiedStageSelection } from "./lib/execution-store.js";
export type {
  ExecutionEvidenceEnvelope,
  ExecutionEvent,
  RebuiltExecution,
  RebuiltWork,
  SignedStageSeal,
  StartedAttempt,
  MeasurementEvidence,
  OrderedExecutionEvent,
  SignedJournalSegment,
} from "./lib/execution-store.js";
export type { CommitAttemptInput, SealedProjection } from "./lib/sealed-projection.js";
export {
  appendCapsuleArtifacts,
  appendCapsuleInventoryParts,
  iterateCapsuleArtifacts,
  appendCapsuleSealArtifacts,
  createQuarterCapsuleStaging,
  sealQuarterCapsule,
  sha256File,
  snapshotCapsuleDbArtifact,
  validateCapsule,
  validateManifestSet,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  writeQuarterCapsuleCandidate,
  extractBatchIdsFromManifest,
  extractSourceLedgerHead,
} from "./lib/capsule.js";
export {
  writeCapsuleInventory,
  readCapsuleInventoryPart,
  createCapsuleInventoryWriter,
} from "./lib/capsule-inventory.js";
export type { CapsuleInventoryPart } from "./lib/capsule-inventory.js";
export type {
  CapsuleArtifact,
  CapsuleSignature,
  InstrumentPlanEntry,
  QuarterCapsule,
  VerifiedManifestSet,
} from "./lib/capsule.js";
export type {
  CapsuleId,
  HdriPeriod,
  InstrumentId,
  ProvisionalAssetId,
  QuarterSourceAdmission,
  SourceBatchId,
  SourceBatchManifest,
  SourceFileReceipt,
  SourceOccurrenceId,
  WorkKey,
  WorkState,
  ExtractionContext,
  ProfileClosure,
  BrowserEvidence,
} from "./lib/quarter-contracts.js";
export {
  discoverPriorCapsules,
  parsePriorCapsulesFile,
  readPriorCapsulesFile,
  verifyPriorCapsule,
  discoverQuarterRecord,
  computePredecessorPeriod,
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
export {
  createFileAdmissionVerificationDeps,
  loadAdmissionInputFromFiles,
  parseAdmissionTrustManifest,
  type AdmissionTrustKey,
  type FileAdmissionVerificationOptions,
} from "./lib/file-admission-verifier.js";
export {
  ADMISSION_ARTIFACT_SCHEMAS,
  verifyAdmissionDomainEvidence,
} from "./lib/admission-domain-verifier.js";
export {
  assertUniqueAssetTargets,
  resolveQuarterScopedUpstreamDbPath,
} from "./lib/quarter-inputs.js";
export type { AssetIdentityTarget, QuarterScopedUpstreamDbInput } from "./lib/quarter-inputs.js";
export { ProgramGateSchema, evaluateProgramGate } from "./lib/program-gate.js";
export type {
  BlockerCode,
  ProgramGate,
  ProgramGateOperation,
  ProgramGateStatus,
} from "./lib/program-gate.js";
export {
  AdmissionInputSchema,
  AdmissionParseError,
  parseAdmissionInput,
  verifyAdmissionInput,
  createBootstrapAdmission,
  toAdmissionInput,
} from "./lib/admission-input.js";
export type {
  AdmissionInput,
  AdmissionVerificationDeps,
  EvidenceRef,
  EvidenceScope,
  EvidenceVerificationResult,
  VerifiedAdmissionInput,
} from "./lib/admission-input.js";
export {
  QuarterRecordSchema,
  QuarterLedgerIndexSchema,
  ReadinessReceiptSchema,
  validateQuarterRecord,
  parseQuarterRecord,
  serializeQuarterRecord,
  validateQuarterRecordRevision,
  parseQuarterRecordRevision,
  serializeQuarterRecordRevision,
  validateQuarterLedgerIndex,
  parseQuarterLedgerIndex,
  serializeQuarterLedgerIndex,
  computeRevisionDigest,
  createQuarterRevision,
  createQuarterLedgerIndex,
  advanceQuarterLedgerIndex,
  createReadinessReceipt,
  validateReadinessReceipt,
} from "./lib/quarter-record.js";
export type {
  QuarterRecord,
  QuarterRecordDraft,
  QuarterCollectionStatus,
  QuarterPublicationStatus,
  QuarterRecordRevision,
  QuarterLedgerIndex,
  ReadinessReceipt,
  ReadinessInput,
  ReadinessStatus,
  ReadinessBlockerCode,
} from "./lib/quarter-record.js";
// hdri-durable-execution.ts is now a re-export shim from execution-store.ts (RFC-0114 B1).
// Imports should go directly to execution-store.js.
