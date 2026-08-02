/*
<MODULE_CONTRACT>
<purpose>Provides a factory for generating app-local pipeline engine wrappers, eliminating boilerplate in apps that only differ in type parameters and context creation.</purpose>
<non-goals>
  <item>Does not implement pipeline execution logic — delegates to runNodePipelineEngine.</item>
  <item>Does not define concrete step behavior or context shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createPipelineEngine factory.</item>
  <item>Propagate optional onEvent callback through to runNodePipelineEngine.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineEventCallback,
  PipelineExecutionGuide,
  PipelineRunOptions,
  PipelineStepContext,
  PipelineStepLike,
} from "@syrokomskyi/pipeline-core";
import { runNodePipelineEngine } from "./run-node-pipeline-engine.js";
import type { CreateNodePipelineAppContextOptions } from "./run-node-pipeline-engine.js";

export type CreatePipelineEngineOptions<
  TState,
  TContext extends PipelineStepContext<TState>,
  TClients,
> = {
  /**
   * Creates the app-local pipeline context from engine-provided artifacts,
   * step numbers, state, and clients.
   */
  createContext: (
    options: CreateNodePipelineAppContextOptions<TState, TContext, TClients>,
  ) => TContext;
};

/**
 * Creates an app-local `runPipelineEngine` function that wraps the shared
 * `runNodePipelineEngine` with the app's type parameters and context creation
 * logic. This eliminates ~50 lines of boilerplate per app engine.ts.
 *
 * Usage in app engine.ts:
 * ```ts
 * import { createPipelineEngine } from "@syrokomskyi/pipeline-node/engine";
 * import { createPipelineContext } from "./context/create-context";
 * import type { Gogol } from "./Gogol";
 * import type { PipelineContext, PipelineState } from "./types";
 *
 * export type PipelineEngineClients = Pick<PipelineContext, "openai">;
 *
 * export const runPipelineEngine = createPipelineEngine<
 *   PipelineState,
 *   PipelineContext,
 *   Gogol,
 *   PipelineEngineClients
 * >({
 *   createContext: (options) => createPipelineContext({
 *     gogolArtifactsById: options.stepArtifactsById,
 *     gogolNumbers: options.stepNumbers,
 *     state: options.state,
 *     clients: options.clients,
 *   }),
 * });
 * ```
 */
export const createPipelineEngine = <
  TState,
  TContext extends PipelineStepContext<TState>,
  TStep extends PipelineStepLike<TContext>,
  TClients,
>(
  options: CreatePipelineEngineOptions<TState, TContext, TClients>,
) => {
  return async (runOptions: {
    clients: TClients;
    gogols: TStep[];
    initialState: TState;
    guide?: PipelineExecutionGuide;
    options?: PipelineRunOptions;
    onEvent?: PipelineEventCallback;
  }): Promise<void> => {
    await runNodePipelineEngine<TState, TContext, TStep, TClients>({
      steps: runOptions.gogols,
      initialState: runOptions.initialState,
      guide: runOptions.guide,
      options: runOptions.options,
      clients: runOptions.clients,
      onEvent: runOptions.onEvent,
      createContext: options.createContext,
    });
  };
};
