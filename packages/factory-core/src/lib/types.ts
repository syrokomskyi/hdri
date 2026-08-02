/*
<MODULE_CONTRACT>
<purpose>Defines interfaces and types for managing HDRI factory pipeline contexts and operations.</purpose>
<non-goals>
  <item>Does not implement the actual logic for pipeline processing.</item>
  <item>Does not handle external API integrations or data fetching.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of HDRI factory-related interfaces and types.</item>
  <item>Remove dead SignDatabaseOptions and VerifyUpstreamOptions — 0 consumers, never re-exported.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineArtifacts, PipelineStepLike } from "@syrokomskyi/pipeline-core";
import type { NodePipelineContext } from "@syrokomskyi/pipeline-node/types";

export interface HdriFactoryBriefBase {
  sourceToken: string;
  skipGogols: string[];
}

export interface HdriFactoryStateBase<B extends HdriFactoryBriefBase = HdriFactoryBriefBase> {
  brief: B;
}

export interface HdriFactoryContextExtras {
  getGogolNumber: (id: string) => number;
  getGogolOutputDir: (id: string) => string;
  getGogolArtifactPath: (id: string, artifactId: string) => string;
  currentGogolId: string | null;
  readGogolArtifactText: (id: string, artifactId: string) => Promise<string>;
  readGogolArtifactJson: (id: string, artifactId: string) => Promise<unknown>;
}

export type HdriFactoryContext<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  A extends Record<string, unknown> = Record<string, never>,
> = NodePipelineContext<S, A> & HdriFactoryContextExtras;

export type HdriFactoryGogolArtifacts<C extends HdriFactoryContext = HdriFactoryContext> =
  PipelineArtifacts<C>;

export type HdriFactoryPipelineStep<C extends HdriFactoryContext = HdriFactoryContext> =
  PipelineStepLike<C>;

export type HdriFactoryEngineClients = Record<string, never>;
