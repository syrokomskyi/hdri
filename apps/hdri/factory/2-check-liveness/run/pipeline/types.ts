/*
<MODULE_CONTRACT>
<purpose>Defines pipeline state, context, and types for the liveness check pipeline.</purpose>
<non-goals>
  <item>Do not contain AI processing capabilities.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { HdriFactoryContextExtras } from "@syrokomskyi/factory-core";
import type { Brief } from "../brief.js";

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

export type PipelineContext = SharedPipelineContext & HdriFactoryContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
