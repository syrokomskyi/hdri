/*
<MODULE_CONTRACT>
<purpose>Executes a series of HDRI factory pipeline steps using a node-based pipeline engine.</purpose>
<non-goals>
  <item>Does not define the specific logic of each HDRI pipeline step.</item>
  <item>Does not handle non-node environments.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of HDRI factory engine execution.</item>
  <item>Accept gogol-named createContext params directly; translate to step-named params internally. Eliminates createHdriFactoryEngine wrapper.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineArtifacts,
  PipelineExecutionGuide,
  PipelineRunOptions,
} from "@syrokomskyi/pipeline-core";
import { runNodePipelineEngine } from "@syrokomskyi/pipeline-node/engine";
import type {
  HdriFactoryContext,
  HdriFactoryStateBase,
  HdriFactoryPipelineStep,
  HdriFactoryEngineClients,
} from "./types.js";

export type { PipelineRunOptions } from "@syrokomskyi/pipeline-core";

export interface HdriFactoryEngineOptions<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  C extends HdriFactoryContext<S, HdriFactoryEngineClients> = HdriFactoryContext<
    S,
    HdriFactoryEngineClients
  >,
  Step extends HdriFactoryPipelineStep<C> = HdriFactoryPipelineStep<C>,
> {
  clients: HdriFactoryEngineClients;
  gogols: Step[];
  initialState: S;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
  createContext: (opts: {
    gogolArtifactsById: Map<string, PipelineArtifacts<C>>;
    gogolNumbers: Map<string, number>;
    state: S;
    clients: HdriFactoryEngineClients;
  }) => C;
}

export async function runHdriFactoryEngine<
  S extends HdriFactoryStateBase = HdriFactoryStateBase,
  C extends HdriFactoryContext<S, HdriFactoryEngineClients> = HdriFactoryContext<
    S,
    HdriFactoryEngineClients
  >,
  Step extends HdriFactoryPipelineStep<C> = HdriFactoryPipelineStep<C>,
>(options: HdriFactoryEngineOptions<S, C, Step>): Promise<void> {
  await runNodePipelineEngine<S, C, Step, HdriFactoryEngineClients>({
    steps: options.gogols,
    initialState: options.initialState,
    guide: options.guide,
    options: options.options,
    clients: options.clients,
    createContext: ({ stepArtifactsById, stepNumbers, state, clients }) =>
      options.createContext({
        gogolArtifactsById: stepArtifactsById,
        gogolNumbers: stepNumbers,
        state,
        clients,
      }),
  });
}
