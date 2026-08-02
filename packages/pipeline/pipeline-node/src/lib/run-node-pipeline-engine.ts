/*
<MODULE_CONTRACT>
<purpose>Executes a node-based pipeline engine using customizable context and steps.</purpose>
<non-goals>
  <item>Does not define specific pipeline steps or their implementations.</item>
  <item>Does not handle external pipeline execution monitoring.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of node-based pipeline execution function.</item>
  <item>Propagate optional run namespace metadata from the shared pipeline engine.</item>
  <item>Propagate optional onEvent callback from the shared pipeline engine.</item>
</CHANGE_SUMMARY>
*/

import {
  runPipelineEngine as runSharedPipelineEngine,
  type PipelineArtifacts,
  type PipelineEventCallback,
  type PipelineExecutionGuide,
  type PipelineRunNamespace,
  type PipelineRunOptions,
  type PipelineStepContext,
  type PipelineStepLike,
} from "@syrokomskyi/pipeline-core";

export type CreateNodePipelineAppContextOptions<
  TState,
  TContext extends PipelineStepContext<TState>,
  TClients,
> = {
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
  stepNumbers: Map<string, number>;
  runNamespace: PipelineRunNamespace;
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
  runNamespace?: PipelineRunNamespace;
  onEvent?: PipelineEventCallback;
}): Promise<TContext> => {
  return runSharedPipelineEngine<TState, TContext, TStep>({
    steps: options.steps,
    initialState: options.initialState,
    guide: options.guide,
    options: options.options,
    runNamespace: options.runNamespace,
    onEvent: options.onEvent,
    createContext: ({ stepArtifactsById, stepNumbers, runNamespace, state }) => {
      return options.createContext({
        stepArtifactsById: stepArtifactsById as Map<string, PipelineArtifacts<TContext>>,
        stepNumbers,
        runNamespace,
        state,
        clients: options.clients,
      });
    },
  });
};

export * from "./pipeline-engine-factory.js";
