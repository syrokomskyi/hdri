/*
<MODULE_CONTRACT>
<purpose>Defines pipeline state, context, and types for the liveness check pipeline.</purpose>
<keywords>pipeline, state, context, types</keywords>
<responsibilities>
  <item>Defines the structure for pipeline state including registry DB path and brief.</item>
  <item>Specifies an empty record for AI services (no AI needed for this rule-based pipeline).</item>
  <item>Enhances shared pipeline context with methods for managing gogol artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not contain AI processing capabilities.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineState">Structure for managing pipeline state data.</entry>
  <entry key="PipelineContext">Contextual information and methods for artifact management.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import type { Brief } from '../brief.js';

// ---------------------------------------------------------------------------
// Pipeline state — carried across all gogols
// ---------------------------------------------------------------------------

export type PipelineState = {
  /** Resolved absolute path to registry.db (expanded from brief.registryDbPath). */
  resolvedRegistryDbPath: string;
  brief: Brief;
};

// ---------------------------------------------------------------------------
// AI services — none needed for this rule-based T1 pipeline
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

