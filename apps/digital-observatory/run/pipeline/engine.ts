/*
<MODULE_CONTRACT>
<purpose>Thin wrapper over the shared pipeline engine for the observatory app.</purpose>
<keywords>pipeline orchestration, execution</keywords>
<responsibilities>
  <item>Runs gogols in order via runNodePipelineEngine.</item>
  <item>Wires the observatory-specific context factory.</item>
</responsibilities>
<non-goals>
  <item>Do not implement step logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runPipelineEngine">Entry point for executing the observatory pipeline.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineExecutionGuide,
  PipelineRunOptions,
} from '@org/pipeline-core';
import { runNodePipelineEngine } from '@org/pipeline-node/engine';
import type { CreateNodePipelineAppContextOptions } from '@org/pipeline-node/engine';
import { createPipelineContext } from './context/create-context';
import type { ObservatoryPipelineStep } from './build-types';
import type { PipelineContext, PipelineState } from './types';

export type { PipelineRunOptions } from '@org/pipeline-core';

export type PipelineEngineClients = Record<string, never>;

export const runPipelineEngine = async (options: {
  clients: PipelineEngineClients;
  gogols: ObservatoryPipelineStep[];
  initialState: PipelineState;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<void> => {
  await runNodePipelineEngine<
    PipelineState,
    PipelineContext,
    ObservatoryPipelineStep,
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
