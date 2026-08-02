/*
<MODULE_CONTRACT>
<purpose>Entry point for the liveness check pipeline application — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform HTTP liveness checks directly — that is handled by CheckLivenessGogol.</item>
  <item>Does not validate brief contents beyond parsing — brief validation is the parser's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: liveness pipeline entry point.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Phase B cleanup: derive year/month from sourceToken instead of removed deprecated fields.</item>
  <item>Fix appRootDir resolution: use briefInputDir instead of inputDir so relative registryDbPath resolves from 2-check-liveness/ (not factory/), matching the upstream convention used by 1-register-businesses.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from "@syrokomskyi/pipeline-core";
import { ensureOutputDir } from "@syrokomskyi/pipeline-node/context";
import { inputDir, briefInputDir, outputRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

/**
 * Resolves registryDbPath (registry.db path) from brief relative to the app's root directory.
 * Absolute paths are returned as-is; relative paths are resolved from rootDir.
 */
const resolveRegistryDbPath = (registryDbPath: string, appRootDir: string): string => {
  if (path.isAbsolute(registryDbPath)) return registryDbPath;
  return path.resolve(appRootDir, registryDbPath);
};

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief } = await bootstrapBrief();

  // Resolve registry.db path relative to the app root (parent of app-local .input/)
  const appRootDir = path.resolve(briefInputDir, "..");
  const resolvedRegistryDbPath = resolveRegistryDbPath(brief.registryDbPath, appRootDir);

  console.log(`\n[site-liveness] registry.db: ${resolvedRegistryDbPath}\n`);

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  console.log(
    `\n${formatPipelineStart({
      inputDir,
      outputDir: outputRootDir,
      pipelineTitle: guide.title,
    })}`,
  );
  console.log(formatPipelineOverview(guide));

  await runPipelineEngine({
    gogols: pipeline.steps,
    guide,
    clients: {},
    initialState: {
      resolvedRegistryDbPath,
      brief,
    },
    options,
  });

  console.log(
    `\n${formatPipelineFinished({
      outputDir: outputRootDir,
      pipelineTitle: guide.title,
    })}`,
  );
};
