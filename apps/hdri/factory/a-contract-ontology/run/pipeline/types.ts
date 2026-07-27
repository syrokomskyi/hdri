/*
<MODULE_CONTRACT>
<purpose>Defines types for the contract-ontology pipeline state, context, and artifacts.</purpose>
<non-goals>
  <item>Do not implement logic — types only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Add DiscoveredCoreDb type and coreDbs field to PipelineState.</item>
  <item>Add discovered AXE DB tracking for audit observation translation.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { HdriFactoryContextExtras } from "@syrokomskyi/factory-core";
import type { Observation, SignalOntology } from "@syrokomskyi/observatory-core";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import type { Brief } from "../brief.js";

// ---------------------------------------------------------------------------
// Pipeline state — serializable, carried across all gogols
// ---------------------------------------------------------------------------

export type DiscoveredPagesDb = {
  deviceId: string;
  sourceToken: string;
  pagesDbPath: string;
  registryDbPath: string;
};

export type IngestedObs = Observation & { _device_id: string };

export type EmitBundleManifest = {
  run_id: string;
  app_id: string;
  period: string;
  emitted_at?: string;
  ontology_version?: string;
  collector_version?: string;
  observation_count: number;
  asset_state_count?: number;
  bundle_hash: string | null;
  emit_dir?: string;
};

export type DiscoveredCoreDb = {
  deviceId: string;
  coreDbPath: string;
};

export type DiscoveredAxeDb = {
  deviceId: string;
  axeDbPath: string;
  registryDbPath: string;
};

export type PipelineState = {
  brief: Brief;
  ontology: SignalOntology | null;
  discoveredPages: DiscoveredPagesDb[];
  coreDbs: DiscoveredCoreDb[];
  axeDbs: DiscoveredAxeDb[];
  allObs: IngestedObs[];
  resolvedObs: IngestedObs[];
  signed: SignedObservation[];
  manifest: EmitBundleManifest | null;
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
