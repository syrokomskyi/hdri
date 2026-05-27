import type { PipelineArtifacts, PipelineExecutionGuide, PipelineRunOptions } from '@org/pipeline-core';
import { runHdriFactoryEngine } from './run-hdri-factory-engine.js';
import type { CreateNodePipelineAppContextOptions } from '@org/pipeline-node/engine';
import type {
  HdriFactoryContext,
  HdriFactoryStateBase,
  HdriFactoryPipelineStep,
  HdriFactoryEngineClients,
} from './types.js';

export type { PipelineRunOptions } from '@org/pipeline-core';

export function createHdriFactoryEngine<
  S extends HdriFactoryStateBase,
  C extends HdriFactoryContext<S>,
  Step extends HdriFactoryPipelineStep<C>,
>(
  createContext: (opts: {
    gogolArtifactsById: Map<string, PipelineArtifacts<C>>;
    gogolNumbers: Map<string, number>;
    state: S;
    clients: HdriFactoryEngineClients;
  }) => C,
): (options: {
  clients: HdriFactoryEngineClients;
  gogols: Step[];
  initialState: S;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}) => Promise<void> {
  return async (options) => {
    await runHdriFactoryEngine<S, C, Step>({
      ...options,
      createContext: ({
        stepArtifactsById,
        stepNumbers,
        state,
        clients,
      }: CreateNodePipelineAppContextOptions<S, C, HdriFactoryEngineClients>) =>
        createContext({
          gogolArtifactsById: stepArtifactsById,
          gogolNumbers: stepNumbers,
          state,
          clients,
        }),
    });
  };
}
