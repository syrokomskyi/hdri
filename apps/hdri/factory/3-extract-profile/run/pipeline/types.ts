/*
<MODULE_CONTRACT>
<purpose>Defines core type aliases for the site-profile pipeline context and state.</purpose>
<non-goals>
  <item>Do not contain runtime logic — this is a pure type-definition module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add domCache property to PipelineContextExtras for shared Cheerio DOM cache.</item>
  <item>Replace local PipelineContextExtras with HdriFactoryContextExtras from @syrokomskyi/factory-core; inline domCache into PipelineContext intersection.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";
import type { HdriFactoryContextExtras } from "@syrokomskyi/factory-core";
import type { DomCache } from "../services/dom-cache.js";
import type { Brief } from "../brief.js";

export type PipelineState = {
  /** Short DB filename stem, e.g. "pages-2026-q3". */
  pagesDbName: string;
  /** Resolved absolute path to registry.db (read-write). */
  resolvedRegistryDbPath: string;
  /** Resolved absolute path to liveness.db (read-only). */
  resolvedLivenessDbPath: string;
  brief: Brief;
};

export type PipelineAiServices = Record<string, never>;

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContext = SharedPipelineContext &
  HdriFactoryContextExtras & {
    /** Shared Cheerio DOM LRU cache across all extraction gogols. */
    domCache: DomCache;
  };

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
