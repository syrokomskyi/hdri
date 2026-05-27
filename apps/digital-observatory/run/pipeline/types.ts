/*
<MODULE_CONTRACT>
<purpose>Defines types for the observatory pipeline state, context, and artifacts.</purpose>
<keywords>pipeline, state, context, types</keywords>
<responsibilities>
  <item>Declares PipelineState with all fields gogols will read/write.</item>
  <item>Defines PipelineContext combining shared context with observatory extras.</item>
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
  <item>Initial creation for digital-observatory pipeline.</item>
  <item>Add scoreCount, cohortId fields to PipelineState for interpret phase.</item>
</CHANGE_SUMMARY>
*/

import type { Buffer } from 'node:buffer';
import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from '@org/pipeline-core';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import type { Brief } from '../brief';

export type PipelineState = {
  brief: Brief;
  runId?: string;
  observationCount?: number;
  assetCount?: number;
  scoreCount?: number;
  cohortId?: string;
};

export type PipelineAiServices = Record<string, never>;

type SharedPipelineContext = NodePipelineContext<
  PipelineState,
  PipelineAiServices
>;

export type PipelineContextExtras = {
  getGogolNumber: (gogolId: string) => number;
  getGogolOutputDir: (gogolId: string) => string;
  getGogolArtifactPath: (gogolId: string, artifactId: string) => string;
  currentGogolId: string | null;
  outputLanguage: string;
  readGogolArtifactText: (gogolId: string, artifactId: string) => Promise<string>;
  readGogolArtifactJson: (gogolId: string, artifactId: string) => Promise<unknown>;
  readGogolArtifactBuffer: (gogolId: string, artifactId: string) => Promise<Buffer>;
};

export type PipelineContext = SharedPipelineContext & PipelineContextExtras;

export type GogolArtifact = SharedPipelineArtifact<PipelineContext>;

export type GogolArtifacts = SharedPipelineArtifacts<PipelineContext>;
