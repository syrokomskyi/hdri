import {
  runPipelineEngine as runSharedPipelineEngine,
  type PipelineArtifacts,
  type PipelineExecutionGuide,
  type PipelineRunOptions,
  type PipelineStepContext,
  type PipelineStepLike,
} from '@org/pipeline-core';

export type CreateNodePipelineAppContextOptions<
  TState,
  TContext extends PipelineStepContext<TState>,
  TClients,
> = {
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
  stepNumbers: Map<string, number>;
  state: TState;
  clients: TClients;
};

export const runNodePipelineEngine = async <
  TState,
  TContext extends PipelineStepContext<TState>,
  TStep extends PipelineStepLike<TContext>,
  TClients,
>(options: {
  clients: TClients;
  createContext: (
    contextOptions: CreateNodePipelineAppContextOptions<TState, TContext, TClients>,
  ) => TContext;
  steps: TStep[];
  initialState: TState;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<TContext> => {
  return runSharedPipelineEngine<TState, TContext, TStep>({
    steps: options.steps,
    initialState: options.initialState,
    guide: options.guide,
    options: options.options,
    createContext: ({ stepArtifactsById, stepNumbers, state }) => {
      return options.createContext({
        stepArtifactsById: stepArtifactsById as Map<string, PipelineArtifacts<TContext>>,
        stepNumbers,
        state,
        clients: options.clients,
      });
    },
  });
};
