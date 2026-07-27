/*
<MODULE_CONTRACT>
<purpose>Defines pipeline state, context, and types for the lighthouse audit pipeline.</purpose>
<non-goals>
  <item>Do not contain AI processing capabilities.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
  <item>Add AuditTarget type for gogol compatibility.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
  <item>Replace local AuditTarget type with re-export from @syrokomskyi/factory-core.</item>
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
  resolvedRegistryDbPath: string;
  resolvedLivenessDbPath: string;
  brief: Brief;
};

// ---------------------------------------------------------------------------
// AI services — none needed for this audit pipeline
// ---------------------------------------------------------------------------

export type PipelineAiServices = Record<string, never>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContext = SharedPipelineContext & HdriFactoryContextExtras;

export type { AuditTarget } from "@syrokomskyi/factory-core";

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
