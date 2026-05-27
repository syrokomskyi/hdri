/*
<MODULE_CONTRACT>
<purpose>Factory that creates the extended pipeline context for site-profile gogols.</purpose>
<keywords>context, factory, pipeline, domcache</keywords>
<responsibilities>
  <item>Wrap createNodePipelineContext from @org/pipeline-node with gogol aliases.</item>
  <item>Inject domCache instance sized from brief.domCacheSize.</item>
</responsibilities>
<non-goals>
  <item>Do not perform DB migrations or I/O beyond context setup.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipelineContext">Builds PipelineContext with extras for the current run.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Instantiate DomCache with brief.domCacheSize and inject into extended context.</item>
</CHANGE_SUMMARY>
*/

import { createHdriFactoryContext } from '@org/hdri-factory-core';
import { inputDir, outputRootDir, promptsDir } from '../../config.js';
import { DomCache } from '../../services/dom-cache.js';
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
  createHdriFactoryContext<PipelineState, { domCache: DomCache }>({
    inputDir,
    outputDir: outputRootDir,
    promptsDir,
    gogolArtifactsById: options.gogolArtifactsById,
    gogolNumbers: options.gogolNumbers,
    state: options.state,
    clients: options.clients,
    extra: () => ({ domCache: new DomCache(options.state.brief.domCacheSize) }),
  }) as PipelineContext;
