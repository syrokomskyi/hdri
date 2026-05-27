import type {
  PipelineAiLogOptions,
  PipelineArtifacts,
  PipelineStepContext,
} from '@org/pipeline-core';

export type NodePipelineContext<TState = unknown, TServices = unknown> = PipelineStepContext<TState> & {
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
    responses: PipelineAiLogOptions['responses']
  ) => Promise<void>;
};

export type CreateNodePipelineContextOptions<
  TState,
  TServices,
  TExtra extends object,
> = {
  inputDir: string;
  outputDir: string;
  promptsDir: string;
  stepArtifactsById: Map<string, PipelineArtifacts<NodePipelineContext<TState, TServices> & TExtra>>;
  stepNumbers: Map<string, number>;
  state: TState;
  services: TServices;
  extendContext?: (baseContext: NodePipelineContext<TState, TServices>) => TExtra;
};
