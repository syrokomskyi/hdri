/*
<MODULE_CONTRACT>
<purpose>App-local binding of the shared factory engine — this module handles engine operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not contain engine logic or context creation — delegated to shared package and create-context.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace local runNodePipelineEngine boilerplate with shared runHdriFactoryEngine.</item>
  <item>Replace inline engine wrapper with createHdriFactoryEngine factory from shared package.</item>
  <item>Replace createHdriFactoryEngine with direct runHdriFactoryEngine call — wrapper chain collapsed.</item>
</CHANGE_SUMMARY>
*/

import { runHdriFactoryEngine } from "@syrokomskyi/factory-core";
import type { PipelineExecutionGuide, PipelineRunOptions } from "@syrokomskyi/pipeline-core";
import { createPipelineContext } from "./context/create-context.js";
import type { SiteLivenessPipelineStep } from "./build-types.js";
import type { PipelineAiServices, PipelineContext, PipelineState } from "./types.js";

export type { PipelineRunOptions } from "@syrokomskyi/pipeline-core";
export type PipelineEngineClients = PipelineAiServices;

export const runPipelineEngine = (options: {
  clients: PipelineEngineClients;
  gogols: SiteLivenessPipelineStep[];
  initialState: PipelineState;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
}): Promise<void> =>
  runHdriFactoryEngine<PipelineState, PipelineContext, SiteLivenessPipelineStep>({
    ...options,
    createContext: createPipelineContext,
  });
