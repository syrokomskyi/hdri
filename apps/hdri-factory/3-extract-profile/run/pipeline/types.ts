/*
<MODULE_CONTRACT>
<purpose>Defines core type aliases for the site-profile pipeline context and state.</purpose>
<keywords>types, pipeline, context, state, domcache</keywords>
<responsibilities>
  <item>Declare PipelineState shape for gogol state management.</item>
  <item>Declare PipelineContextExtras with gogol-specific helpers and DomCache.</item>
  <item>Re-export shared artifact types parameterized for PipelineContext.</item>
</responsibilities>
<non-goals>
  <item>Do not contain runtime logic — this is a pure type-definition module.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineState">State shape carried through pipeline execution.</entry>
  <entry key="PipelineContextExtras">Extension interface for gogol helpers and domCache.</entry>
  <entry key="PipelineContext">Combined NodePipelineContext + extras used by all gogols.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add domCache property to PipelineContextExtras for shared Cheerio DOM cache.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import type { DomCache } from '../services/dom-cache.js';
import type { Brief } from '../brief.js';

export type PipelineState = {
  /** Short DB filename stem, e.g. "pages-2026-h1". */
  pagesDbName: string;
  /** Resolved absolute path to registry.db (read-write). */
  resolvedRegistryDbPath: string;
  /** Resolved absolute path to liveness.db (read-only). */
  resolvedLivenessDbPath: string;
  brief: Brief;
};

export type PipelineAiServices = Record<string, never>;

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

export type PipelineContextExtras = {
  getGogolNumber: (gogolId: string) => number;
  getGogolOutputDir: (gogolId: string) => string;
  getGogolArtifactPath: (gogolId: string, artifactId: string) => string;
  currentGogolId: string | null;
  readGogolArtifactText: (gogolId: string, artifactId: string) => Promise<string>;
  readGogolArtifactJson: (gogolId: string, artifactId: string) => Promise<unknown>;
  /** Shared Cheerio DOM LRU cache across all extraction gogols. */
  domCache: DomCache;
};

export type PipelineContext = SharedPipelineContext & PipelineContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;
export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;

