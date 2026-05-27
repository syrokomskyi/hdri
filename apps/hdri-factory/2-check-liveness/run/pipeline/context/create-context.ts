/*
<MODULE_CONTRACT>
<purpose>Composes the pipeline context for the check-liveness app from shared HDRI factory context and app-specific options.</purpose>
<keywords>context, pipeline, composition, factory</keywords>
<responsibilities>
  <item>Defines the PipelineClientsForContext type alias for AI services.</item>
  <item>Creates the PipelineContext by calling the shared createHdriFactoryContext with app-local paths and state.</item>
</responsibilities>
<non-goals>
  <item>Does not define the shared context factory itself.</item>
  <item>Does not manage individual gogol step contexts.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PipelineClientsForContext">Type alias for the AI services clients passed into the context.</entry>
  <entry key="createPipelineContext">Factory function that builds the full PipelineContext from gogol artifacts, numbers, state, and clients.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
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

