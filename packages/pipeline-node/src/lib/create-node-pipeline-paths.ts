import path from 'node:path';
import type { PipelineArtifacts, PipelineStepContext } from '@org/pipeline-core';

export const createNodePipelinePaths = <TContext extends PipelineStepContext>(options: {
  outputDir: string;
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
  stepNumbers: Map<string, number>;
}) => {
  const getStepNumber = (stepId: string): number => {
    const number = options.stepNumbers.get(stepId);
    if (!number) {
      throw new Error(`Unknown pipeline step id: ${stepId}`);
    }
    return number;
  };

  const getStepOutputDir = (stepId: string): string => {
    return path.join(options.outputDir, `${getStepNumber(stepId)}-${stepId}`);
  };

  const getOutputPath = (stepId: string, baseFileName: string): string => {
    return path.join(getStepOutputDir(stepId), baseFileName);
  };

  const getStepArtifactPath = (stepId: string, artifactId: string): string => {
    const artifacts = options.stepArtifactsById.get(stepId);
    if (!artifacts) {
      throw new Error(`Unknown pipeline step id: ${stepId}`);
    }

    const artifact = artifacts[artifactId];
    if (!artifact) {
      throw new Error(`Unknown artifact id: ${artifactId} for step ${stepId}`);
    }

    return path.join(getStepOutputDir(stepId), artifact.relativePath);
  };

  return {
    getStepNumber,
    getStepOutputDir,
    getOutputPath,
    getStepArtifactPath,
  };
};
