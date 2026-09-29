/*
<MODULE_CONTRACT>
<purpose>Defines types for the contract-ontology pipeline state, context, and artifacts.</purpose>
<non-goals>
  <item>Do not implement logic — types only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 B5: carry exact retained snapshot identity and authenticated execution selection into translation.</item>
  <item>Add DiscoveredCoreDb type and coreDbs field to PipelineState.</item>
  <item>Add discovered AXE DB tracking for audit observation translation.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
  <item>RFC-0106: Add VerifiedStageSnapshot and TranslationClosure contracts for verified source admission.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@warpgogol/pipeline-core";
import type { NodePipelineContext } from "@warpgogol/pipeline-node/types";
import type {
  HdriFactoryContextExtras,
  CapsuleArtifact,
  VerifiedQuarterExecution,
} from "@syrokomskyi/factory-core";
import type { Observation, SignalOntology } from "@syrokomskyi/observatory-core";
import type { EmitManifest } from "@syrokomskyi/observatory-emit";
import type { Brief } from "../brief.js";

// ---------------------------------------------------------------------------
// Pipeline state — serializable, carried across all gogols
// ---------------------------------------------------------------------------

export type AdmittedSnapshot = {
  deviceId: string;
  capsuleDir: string;
  artifact: CapsuleArtifact;
  execution: VerifiedQuarterExecution;
  sourceOutputRoot: string;
};

export type DiscoveredPagesDb = AdmittedSnapshot & {
  pagesDbPath: string;
};

export type IngestedObs = Observation & { _device_id: string };

export type DiscoveredCoreDb = {
  deviceId: string;
  coreDbPath: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  sourceManifestSha256: string;
  snapshotSha256: string;
  sourceLedgerRoot: string;
};

export type DiscoveredAxeDb = AdmittedSnapshot & {
  axeDbPath: string;
};

export type DiscoveredLivenessDb = AdmittedSnapshot & {
  livenessDbPath: string;
};

export type VerifiedStageSnapshot = {
  schema: "hdri-stage-snapshot@1";
  period: string;
  capsuleId: string;
  deviceId: string;
  stageId: string;
  stageSealSha256: string;
  targetSetSha256: string;
  selectedResultSetSha256: string;
  projectionSha256: string;
  artifactRefs: string[];
};

export type TranslationClosure = {
  expectedKeysSha256: string;
  emittedKeysSha256: string;
  sourceSnapshots: string[];
  unresolvedReferences: number;
};

export type PipelineState = {
  brief: Brief;
  ontology: SignalOntology | null;
  discoveredPages: DiscoveredPagesDb[];
  coreDbs: DiscoveredCoreDb[];
  livenessDbs: DiscoveredLivenessDb[];
  axeDbs: DiscoveredAxeDb[];
  observationDbPath: string | null;
  signedObservationDbPath: string | null;
  manifest: EmitManifest | null;
  verifiedSnapshots: VerifiedStageSnapshot[];
  translationClosure: TranslationClosure | null;
};

// ---------------------------------------------------------------------------
// AI services — none needed
// ---------------------------------------------------------------------------

export type PipelineAiServices = Record<string, never>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContext = SharedPipelineContext & HdriFactoryContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
