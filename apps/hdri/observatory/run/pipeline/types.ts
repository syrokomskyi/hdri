/*
<MODULE_CONTRACT>
<purpose>Defines types for the observatory pipeline state, context, and artifacts.</purpose>
<non-goals>
  <item>Do not implement logic — types only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add scoreCount, cohortId fields to PipelineState for interpret phase.</item>
  <item>RFC-0109: add releaseInputPath and releaseEnvelopePath to PipelineState.</item>
  <item>RFC-0115: add scientificInputPath to PipelineState for registry-driven validation.</item>
</CHANGE_SUMMARY>
*/

import type { Buffer } from "node:buffer";
import type {
  PipelineArtifact as SharedPipelineArtifact,
  PipelineArtifacts as SharedPipelineArtifacts,
} from "@warpgogol/pipeline-core";
import type { NodePipelineContext } from "@warpgogol/pipeline-node/types";
import type { Brief } from "../brief";

export type PipelineState = {
  brief: Brief;
  runId?: string;
  observationCount?: number;
  assetCount?: number;
  scoreCount?: number;
  cohortId?: string;
  capsuleDir?: string;
  vaultShardPaths?: string[];
  martPaths?: string[];
  publicManifestPath?: string;
  candidateManifestPath?: string;
  releaseInputPath?: string;
  releaseEnvelopePath?: string;
  scientificInputPath?: string;
};

export type PipelineAiServices = Record<string, never>;

type SharedPipelineContext = NodePipelineContext<PipelineState, PipelineAiServices>;

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
