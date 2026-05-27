import fs from "node:fs/promises";

import {
  ensureOutputDir,
  fileExists,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from "./create-node-pipeline-fs.js";
import { createNodePipelinePaths } from "./create-node-pipeline-paths.js";
import { createPipelineAiLogger } from "./create-pipeline-ai-logger.js";
import { assertArtifactValid, readArtifactBuffer, readArtifactJson, readArtifactText } from "./artifact-io.js";
import type { CreateNodePipelineContextOptions, NodePipelineContext } from "./node-pipeline-types.js";

export const createNodePipelineContext = <
  TState,
  TServices,
  TExtra extends object = Record<string, never>,
>(
  options: CreateNodePipelineContextOptions<TState, TServices, TExtra>
): NodePipelineContext<TState, TServices> & TExtra => {
  let currentStepId: string | null = null;
  const paths = createNodePipelinePaths({
    outputDir: options.outputDir,
    stepArtifactsById: options.stepArtifactsById,
    stepNumbers: options.stepNumbers,
  });

  const aiLogger = createPipelineAiLogger({
    getCurrentStepId: () => currentStepId,
    getStepOutputDir: paths.getStepOutputDir,
    ensureOutputDir,
    writeTextFile,
  });

  const logStepEvent: NodePipelineContext<TState, TServices>["logStepEvent"] = async (event) => {
    const stepId = event.stepId ?? currentStepId;
    if (!stepId) {
      return;
    }

    const stepOutputDir = paths.getStepOutputDir(stepId);
    const shouldCreateStepOutputDir = event.allowCreateStepOutputDir ?? true;

    const payload = {
      timestamp: new Date().toISOString(),
      stepId,
      stepNumber: paths.getStepNumber(stepId),
      ...event,
    };

    if (!shouldCreateStepOutputDir) {
      const outputDirExists = await fileExists(stepOutputDir);
      if (!outputDirExists) {
        return;
      }
    }

    await ensureOutputDir(stepOutputDir);
    await fs.appendFile(
      paths.getOutputPath(stepId, "log.txt"),
      `${JSON.stringify(payload)}\n`,
      "utf-8"
    );
  };

  const baseContext = {
    inputDir: options.inputDir,
    outputDir: options.outputDir,
    promptsDir: options.promptsDir,
    services: options.services,
    state: options.state,
    getPipelineOutputDir: () => options.outputDir,
    get currentStepId() {
      return currentStepId;
    },
    set currentStepId(value: string | null) {
      currentStepId = value;
    },
    ...paths,
    ensureOutputDir,
    fileExists,
    readJsonFile,
    readTextFile,
    writeTextFile,
    writeJsonFile,
    assertStepArtifactValid: async (stepId: string, artifactId: string) => {
      await assertArtifactValid({
        ctx,
        stepId,
        artifactId,
        artifactsByStepId: options.stepArtifactsById,
      });
    },
    readStepArtifactText: async (stepId: string, artifactId: string) => {
      return readArtifactText({
        ctx,
        stepId,
        artifactId,
        artifactsByStepId: options.stepArtifactsById,
      });
    },
    readStepArtifactJson: async (stepId: string, artifactId: string) => {
      return readArtifactJson({
        ctx,
        stepId,
        artifactId,
        artifactsByStepId: options.stepArtifactsById,
      });
    },
    readStepArtifactBuffer: async (stepId: string, artifactId: string) => {
      return readArtifactBuffer({
        ctx,
        stepId,
        artifactId,
        artifactsByStepId: options.stepArtifactsById,
      });
    },
    logStepEvent,
    logAiCall: aiLogger.logAiCall,
    writeAiResponses: aiLogger.writeAiResponses,
  } satisfies NodePipelineContext<TState, TServices>;

  const ctx = baseContext as NodePipelineContext<TState, TServices> & TExtra;
  const extension = options.extendContext?.(baseContext) ?? ({} as TExtra);
  Object.defineProperties(ctx, Object.getOwnPropertyDescriptors(extension));

  return ctx;
};
