/*
<MODULE_CONTRACT>
<purpose>Defines types for the contract-ontology pipeline state, context, and artifacts.</purpose>
<keywords>pipeline, state, context, types</keywords>
<responsibilities>
  <item>Declares PipelineState with all fields gogols will read/write.</item>
  <item>Defines PipelineContext combining shared context with app-specific extras.</item>
</responsibilities>
<non-goals>
  <item>Do not implement logic — types only.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineState">Observable state passed across gogols.</entry>
  <entry key="PipelineContext">Full context available to every gogol.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Add DiscoveredCoreDb type and coreDbs field to PipelineState.</item>
  <item>Add discovered AXE DB tracking for audit observation translation.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import type { Observation, SignalOntology } from '@org/observatory-core';
import type { SignedObservation } from '@org/observatory-crypto';
import type { Brief } from '../brief.js';

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

export type PipelineContextExtras = {
  getGogolNumber: (gogolId: string) => number;
  getGogolOutputDir: (gogolId: string) => string;
  getGogolArtifactPath: (gogolId: string, artifactId: string) => string;
  currentGogolId: string | null;
  readGogolArtifactText: (gogolId: string, artifactId: string) => Promise<string>;
  readGogolArtifactJson: (gogolId: string, artifactId: string) => Promise<unknown>;
};

export type PipelineContext = SharedPipelineContext & PipelineContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
