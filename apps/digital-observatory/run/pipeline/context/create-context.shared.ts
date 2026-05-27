/*
<MODULE_CONTRACT>
<purpose>Creates the observatory pipeline context with gogol helpers and state.</purpose>
<keywords>pipeline context, state management</keywords>
<responsibilities>
  <item>Creates a pipeline context integrating artifacts, state, and output paths.</item>
  <item>Extends context with gogol-aliased accessors for step data.</item>
</responsibilities>
<non-goals>
  <item>Do not implement AI service integration — observatory has none.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createPipelineContext">Main factory for the observatory pipeline context.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import {
  createNodePipelineContext,
} from '@org/pipeline-node/context';
import type { NodePipelineContext } from '@org/pipeline-node/types';
import { inputDir, outputRootDir, promptsDir } from '../../config';
import type {
  GogolArtifacts,
  PipelineAiServices,
  PipelineContext,
  PipelineContextExtras,
  PipelineState,
} from '../types';

export type PipelineClientsForContext = PipelineAiServices;

export const createPipelineContext = (options: {
  gogolArtifactsById: Map<string, GogolArtifacts>;
  gogolNumbers: Map<string, number>;
  state: PipelineState;
  clients: PipelineClientsForContext;
}): PipelineContext => {
  return createNodePipelineContext<
    PipelineState,
    PipelineAiServices,
    PipelineContextExtras
  >({
    inputDir,
    outputDir: outputRootDir,
    promptsDir,
    stepArtifactsById: options.gogolArtifactsById,
    stepNumbers: options.gogolNumbers,
    state: options.state,
    services: options.clients,
    extendContext: (
      baseContext: NodePipelineContext<PipelineState, PipelineAiServices>,
    ) => {
      const readStepArtifactTextBase = baseContext.readStepArtifactText;
      const readStepArtifactJsonBase = baseContext.readStepArtifactJson;
      const readStepArtifactBufferBase = baseContext.readStepArtifactBuffer;

      return {
        get currentGogolId() {
          return baseContext.currentStepId;
        },
        set currentGogolId(value: string | null) {
          baseContext.currentStepId = value;
        },
        get outputLanguage() {
          return baseContext.state.brief.outputLanguage;
        },
        getGogolNumber: (gogolId: string) => baseContext.getStepNumber(gogolId),
        getGogolOutputDir: (gogolId: string) => baseContext.getStepOutputDir(gogolId),
        getGogolArtifactPath: (gogolId: string, artifactId: string) =>
          baseContext.getStepArtifactPath(gogolId, artifactId),
        readGogolArtifactText: async (gogolId: string, artifactId: string) =>
          readStepArtifactTextBase(gogolId, artifactId),
        readGogolArtifactJson: async (gogolId: string, artifactId: string) =>
          readStepArtifactJsonBase(gogolId, artifactId),
        readGogolArtifactBuffer: async (gogolId: string, artifactId: string) =>
          readStepArtifactBufferBase(gogolId, artifactId),
      };
    },
  }) as PipelineContext;
};
