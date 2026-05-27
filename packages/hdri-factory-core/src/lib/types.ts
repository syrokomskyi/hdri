import type {
  PipelineArtifacts,
  PipelineStepLike,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';

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

export type HdriFactoryPipelineStep<
  C extends HdriFactoryContext = HdriFactoryContext,
> = PipelineStepLike<C>;

export type HdriFactoryEngineClients = Record<string, never>;

export interface SignDatabaseOptions {
  dbPath: string;
  dbName: string;
  appId: string;
  toRelativePath: (p: string) => string;
  ensureOutputDir: (p: string) => Promise<void>;
}

export interface VerifyUpstreamOptions {
  upstreamOutputRoot: string;
  dbPattern: RegExp;
  toRelativePath: (p: string) => string;
  ensureOutputDir: (p: string) => Promise<void>;
}
