/*
<MODULE_CONTRACT>
<purpose>Facilitates the creation of a pipeline context for managing artifacts and state in a structured manner.</purpose>
<keywords>pipeline, context, artifacts, state</keywords>
<responsibilities>
  <item>Constructs a context object that integrates input/output directories and service clients.</item>
  <item>Extends the base context with additional methods for artifact management and state tracking.</item>
  <item>Maps Gogol IDs to their respective numbers and output directories.</item>
</responsibilities>
<non-goals>
  <item>Do not handle raw content parsing or validation of input data.</item>
  <item>Do not manage the orchestration of pipeline execution or transport mechanisms.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipelineContext">Function to create a pipeline context.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Added GRACE scaffolding to define the architectural role and responsibilities of the context creation function.</item>
  <item>Replace createNodePipelineContext boilerplate with shared createHdriFactoryContext.</item>
</CHANGE_SUMMARY>
*/

import { createHdriFactoryContext } from '@org/hdri-factory-core';
import { inputDir, outputRootDir, promptsDir } from '../../config.js';
import type {
  GogolArtifacts,
  PipelineAiServices,
  PipelineContext,
  PipelineState,
} from '../types.js';

export type PipelineClientsForContext = PipelineAiServices;

export const createPipelineContext = (options: {
  gogolArtifactsById: Map<string, GogolArtifacts>;
  gogolNumbers: Map<string, number>;
  state: PipelineState;
  clients: PipelineClientsForContext;
}): PipelineContext =>
  createHdriFactoryContext<PipelineState>({
    inputDir,
    outputDir: outputRootDir,
    promptsDir,
    gogolArtifactsById: options.gogolArtifactsById,
    gogolNumbers: options.gogolNumbers,
    state: options.state,
    clients: options.clients,
  }) as PipelineContext;

