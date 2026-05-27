import type { PipelineExecutionGuide, PipelineRunOptions } from '@org/pipeline-core';
import { runNodePipelineEngine } from '@org/pipeline-node/engine';
import type { CreateNodePipelineAppContextOptions } from '@org/pipeline-node/engine';
import type {
  HdriFactoryContext,
  HdriFactoryStateBase,
  HdriFactoryPipelineStep,
  HdriFactoryEngineClients,
} from './types.js';

export type { PipelineRunOptions } from '@org/pipeline-core';

export interface HdriFactoryEngineOptions<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  C extends HdriFactoryContext<S, HdriFactoryEngineClients> = HdriFactoryContext<S, HdriFactoryEngineClients>,
  Step extends HdriFactoryPipelineStep<C> = HdriFactoryPipelineStep<C>,
> {
  clients: HdriFactoryEngineClients;
  gogols: Step[];
  initialState: S;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
  createContext: (opts: CreateNodePipelineAppContextOptions<S, C, HdriFactoryEngineClients>) => C;
}

export async function runHdriFactoryEngine<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  C extends HdriFactoryContext<S, HdriFactoryEngineClients> = HdriFactoryContext<S, HdriFactoryEngineClients>,
  Step extends HdriFactoryPipelineStep<C> = HdriFactoryPipelineStep<C>,
>(options: HdriFactoryEngineOptions<S, C, Step>): Promise<void> {
  await runNodePipelineEngine<S, C, Step, HdriFactoryEngineClients>({
    steps: options.gogols,
    initialState: options.initialState,
    guide: options.guide,
    options: options.options,
    clients: options.clients,
    createContext: options.createContext,
  });
}
