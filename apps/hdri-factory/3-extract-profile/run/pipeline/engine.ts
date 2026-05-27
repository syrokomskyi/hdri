/*
<MODULE_CONTRACT>
<purpose>App-local binding of the shared hdri-factory engine.</purpose>
<keywords>pipeline, engine, binding</keywords>
<responsibilities>
  <item>Export runPipelineEngine created by createHdriFactoryEngine factory with app-local types.</item>
</responsibilities>
<non-goals>
  <item>Do not contain engine logic or context creation — delegated to shared package and create-context.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runPipelineEngine">App-typed entry point created by shared factory.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Replace local runNodePipelineEngine boilerplate with shared runHdriFactoryEngine.</item>
  <item>Replace inline engine wrapper with createHdriFactoryEngine factory from shared package.</item>
</CHANGE_SUMMARY>
*/

import { createHdriFactoryEngine } from '@org/hdri-factory-core';
import { createPipelineContext } from './context/create-context.js';
import type { SiteProfilePipelineStep } from './build-types.js';
import type { PipelineAiServices, PipelineContext, PipelineState } from './types.js';

export type { PipelineRunOptions } from '@org/pipeline-core';
export type PipelineEngineClients = PipelineAiServices;
export const runPipelineEngine = createHdriFactoryEngine<PipelineState, PipelineContext, SiteProfilePipelineStep>(createPipelineContext);

