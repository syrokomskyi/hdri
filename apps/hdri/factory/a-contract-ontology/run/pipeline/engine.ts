/*
<MODULE_CONTRACT>
<purpose>Thin wrapper over the shared pipeline engine for the contract-ontology app.</purpose>
<non-goals>
  <item>Do not implement step logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Replace inline runNodePipelineEngine boilerplate with createHdriFactoryEngine from @syrokomskyi/factory-core.</item>
  <item>Replace createHdriFactoryEngine with direct runHdriFactoryEngine call — wrapper chain collapsed.</item>
</CHANGE_SUMMARY>
*/

import { runHdriFactoryEngine } from "@syrokomskyi/factory-core";
import type { PipelineExecutionGuide, PipelineRunOptions } from "@syrokomskyi/pipeline-core";
import { createPipelineContext } from "./context/create-context.js";
import type { ContractOntologyPipelineStep } from "./build-types.js";
import type { PipelineAiServices, PipelineContext, PipelineState } from "./types.js";

export type { PipelineRunOptions } from "@syrokomskyi/pipeline-core";
export type PipelineEngineClients = PipelineAiServices;

export const runPipelineEngine = (options: {
  clients: PipelineEngineClients;
  gogols: ContractOntologyPipelineStep[];
  initialState: PipelineState;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<void> =>
  runHdriFactoryEngine<PipelineState, PipelineContext, ContractOntologyPipelineStep>({
    ...options,
    createContext: createPipelineContext,
  });
