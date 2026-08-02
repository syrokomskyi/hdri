/*
<MODULE_CONTRACT>
<purpose>Defines types for managing and interacting with node-based pipeline contexts, facilitating file operations and AI logging within the pipeline framework.</purpose>
<non-goals>
  <item>Does not implement specific pipeline logic or processing steps.</item>
  <item>Does not handle network operations or external API integrations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of types for node pipeline context and creation options.</item>
  <item>Added optional run namespace metadata to node pipeline context creation.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineAiLogOptions,
  PipelineArtifacts,
  PipelineRunNamespace,
  PipelineStepContext,
  TokenUsage,
} from "@syrokomskyi/pipeline-core";

export type NodePipelineContext<
  TState = unknown,
  TServices = unknown,
> = PipelineStepContext<TState> & {
  inputDir: string;
  outputDir: string;
  promptsDir: string;
  services: TServices;
  readTextFile: (filePath: string) => Promise<string>;
  readJsonFile: (filePath: string) => Promise<unknown>;
  writeTextFile: (filePath: string, content: string) => Promise<void>;
  writeJsonFile: (filePath: string, value: unknown) => Promise<void>;
  readStepArtifactText: (stepId: string, artifactId: string) => Promise<string>;
  readStepArtifactJson: (stepId: string, artifactId: string) => Promise<unknown>;
  readStepArtifactBuffer: (stepId: string, artifactId: string) => Promise<Buffer>;
  logAiCall: (options: PipelineAiLogOptions) => Promise<string | null>;
  writeAiResponses: (
    callDir: string | null,
    responses: PipelineAiLogOptions["responses"],
  ) => Promise<void>;
  writeAiUsage: (callDir: string | null, usage: TokenUsage) => Promise<void>;
};

export type CreateNodePipelineContextOptions<TState, TServices, TExtra extends object> = {
  inputDir: string;
  outputDir: string;
  promptsDir: string;
  runNamespace?: PipelineRunNamespace;
  stepArtifactsById: Map<
    string,
    PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>
  >;
  stepNumbers: Map<string, number>;
  state: TState;
  services: TServices;
  extendContext?: (baseContext: NodePipelineContext<TState, TServices>) => TExtra;
};
