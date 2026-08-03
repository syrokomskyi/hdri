/*
<MODULE_CONTRACT> 
<purpose>Facilitates type definitions for pipeline state and context in the T0 catalog harvest.</purpose> 
 
 
<non-goals> 
  <item>Do not include AI processing capabilities within this module.</item> 
  <item>Do not handle transport or configuration orchestration for the pipeline.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY> 
  <item>Refine type definitions for clarity in pipeline state and context management.</item>
  <item>Add rootBrief to PipelineState so gogols can read factory-level configuration directly.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY> 
*****/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { HdriFactoryContextExtras, LedgerDiscoveryResult } from "@syrokomskyi/factory-core";
import type { Brief } from "../brief.js";

// ---------------------------------------------------------------------------
// Pipeline state — carried across all gogols
// ---------------------------------------------------------------------------

export type PipelineState = {
  /** Batch folder names found under .input/batches (≥1 guaranteed). */
  batchNames: string[];
  brief: Brief;
  /** Factory-level (root) brief, before app-local overrides. */
  rootBrief: Brief;
  /** Two-phase discovery result: prior capsule segments + current batch IDs. */
  discovery: LedgerDiscoveryResult;
};

// ---------------------------------------------------------------------------
// AI services — none needed for this rule-based T0 pipeline
// ---------------------------------------------------------------------------

export type PipelineAiServices = Record<string, never>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContext = SharedPipelineContext & HdriFactoryContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
