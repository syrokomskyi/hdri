/*
<MODULE_CONTRACT> 
<purpose>Facilitates type definitions for pipeline state and context in the T0 catalog harvest.</purpose> 
<keywords>pipeline, state, context, types</keywords> 
<responsibilities> 
  <item>Defines the structure for pipeline state, including harvest batch ID and associated batch names.</item> 
  <item>Specifies an empty record for AI services, indicating no AI functionality is required.</item> 
  <item>Enhances shared pipeline context with methods for managing gogol artifacts.</item> 
</responsibilities> 
<non-goals> 
  <item>Do not include AI processing capabilities within this module.</item> 
  <item>Do not handle transport or configuration orchestration for the pipeline.</item> 
</non-goals> 
</MODULE_CONTRACT> 
<MODULE_MAP> 
  <entry key="PipelineState">Structure for managing pipeline state data.</entry> 
  <entry key="PipelineContext">Contextual information and methods for artifact management.</entry> 
</MODULE_MAP> 
<CHANGE_SUMMARY> 
  <item>Refine type definitions for clarity in pipeline state and context management.</item>
  <item>Add rootBrief to PipelineState so gogols can read factory-level configuration directly.</item>
</CHANGE_SUMMARY> 
*****/

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
  /** Batch folder names found under .input/batches (≥1 guaranteed). */
  batchNames: string[];
  brief: Brief;
  /** Factory-level (root) brief, before app-local overrides. */
  rootBrief: Brief;
};

// ---------------------------------------------------------------------------
// AI services — none needed for this rule-based T0 pipeline
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

