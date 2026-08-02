/*
<MODULE_CONTRACT>
<purpose>Path resolution utilities for node-based pipeline step output directories and artifacts.</purpose>
<non-goals>
  <item>Does not implement file I/O or context assembly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from create-node-pipeline-context.ts to separate path logic from context assembly.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

import type { PipelineArtifacts, PipelineStepContext } from "@syrokomskyi/pipeline-core";

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
