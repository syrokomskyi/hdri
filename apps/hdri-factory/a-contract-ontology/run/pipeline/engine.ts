/*
<MODULE_CONTRACT>
<purpose>Thin wrapper over the shared pipeline engine for the contract-ontology app.</purpose>
<keywords>pipeline orchestration, execution</keywords>
<responsibilities>
  <item>Runs gogols in order via runNodePipelineEngine.</item>
  <item>Wires the contract-ontology-specific context factory.</item>
</responsibilities>
<non-goals>
  <item>Do not implement step logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runPipelineEngine">Entry point for executing the contract-ontology pipeline.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineExecutionGuide,
  PipelineRunOptions,
} from '@org/pipeline-core';
import { runNodePipelineEngine } from '@org/pipeline-node/engine';
import type { CreateNodePipelineAppContextOptions } from '@org/pipeline-node/engine';
import { createPipelineContext } from './context/create-context.js';
import type { ContractOntologyPipelineStep } from './build-types.js';
import type { PipelineAiServices, PipelineContext, PipelineState } from './types.js';

export type { PipelineRunOptions } from '@org/pipeline-core';

export type PipelineEngineClients = PipelineAiServices;

export const runPipelineEngine = async (options: {
  clients: PipelineEngineClients;
  gogols: ContractOntologyPipelineStep[];
  initialState: PipelineState;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<void> => {
  await runNodePipelineEngine<
    PipelineState,
    PipelineContext,
    ContractOntologyPipelineStep,
    PipelineEngineClients
  >({
    steps: options.gogols,
    initialState: options.initialState,
    guide: options.guide,
    options: options.options,
    clients: options.clients,
    createContext: ({
      stepArtifactsById,
      stepNumbers,
      state,
      clients,
    }: CreateNodePipelineAppContextOptions<
      PipelineState,
      PipelineContext,
      PipelineEngineClients
    >) => {
      return createPipelineContext({
        gogolArtifactsById: stepArtifactsById,
        gogolNumbers: stepNumbers,
        state,
        clients,
      });
    },
  });
};
