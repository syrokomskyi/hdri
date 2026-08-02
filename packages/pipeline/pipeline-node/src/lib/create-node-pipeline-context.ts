/*
<MODULE_CONTRACT>
<purpose>Creates and manages the context for a node-based pipeline, facilitating logging and artifact handling.</purpose>
<non-goals>
  <item>Does not execute pipeline steps or manage step logic.</item>
  <item>Does not implement FS utilities, path resolution, or AI logging directly (see node-fs-utils.ts, node-pipeline-paths.ts, pipeline-ai-logger-factory.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the node pipeline context creation function.</item>
  <item>Consolidated context creation helpers from create-node-pipeline-fs.ts, create-node-pipeline-paths.ts, and create-pipeline-ai-logger.ts into a single file.</item>
  <item>Remove unused exports listFiles and getImageMimeTypeByFileName that have no consumers.</item>
  <item>Expose run namespace metadata on every node pipeline context.</item>
  <item>Add toDisplayPath utility for resolving paths relative to process.cwd() with forward-slash normalization.</item>
  <item>Extract FS utilities into node-fs-utils.ts, path logic into node-pipeline-paths.ts, and AI logger into pipeline-ai-logger-factory.ts.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";

import {
  assertArtifactValid,
  readArtifactBuffer,
  readArtifactJson,
  readArtifactText,
} from "./artifact-io.js";
import {
  ensureOutputDir,
  fileExists,
  readJsonFile,
  readTextFile,
  writeTextFile,
  writeJsonFile,
} from "./node-fs-utils.js";
import { createNodePipelinePaths } from "./node-pipeline-paths.js";
import { createPipelineAiLogger } from "./pipeline-ai-logger-factory.js";
import type {
  CreateNodePipelineContextOptions,
  NodePipelineContext,
} from "./node-pipeline-types.js";

export const createNodePipelineContext = <
  TState,
  TServices,
  TExtra extends object = Record<string, never>,
>(
  options: CreateNodePipelineContextOptions<TState, TServices, TExtra>,
): NodePipelineContext<TState, TServices> & TExtra => {
  let currentStepId: string | null = null;
  const paths = createNodePipelinePaths({
    outputDir: options.outputDir,
    stepArtifactsById: options.stepArtifactsById,
    stepNumbers: options.stepNumbers,
  });
  const runNamespace = options.runNamespace ?? {
    outputRootDir: options.outputDir,
    lockedInputs: {},
    reuseSource: "local_artifacts" as const,
  };

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
      "utf-8",
    );
  };

  const baseContext = {
    inputDir: options.inputDir,
    outputDir: options.outputDir,
    promptsDir: options.promptsDir,
    runNamespace,
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
    writeAiUsage: aiLogger.writeAiUsage,
  } satisfies NodePipelineContext<TState, TServices>;

  const ctx = baseContext as NodePipelineContext<TState, TServices> & TExtra;
  const extension = options.extendContext?.(baseContext) ?? ({} as TExtra);
  Object.defineProperties(ctx, Object.getOwnPropertyDescriptors(extension));

  return ctx;
};

// Re-export utilities for external consumers
export {
  ensureOutputDir,
  fileExists,
  readTextFile,
  readBinaryFile,
  listFiles,
  getImageMimeTypeByFileName,
  readJsonFile,
  writeTextFile,
  writeBinaryFile,
  writeJsonFile,
  toDisplayPath,
} from "./node-fs-utils.js";
export { createNodePipelinePaths } from "./node-pipeline-paths.js";
export { createPipelineAiLogger } from "./pipeline-ai-logger-factory.js";
