/*
<MODULE_CONTRACT>
<purpose>Entry point for the site-profile pipeline application — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform HTTP crawling or extraction directly — that is handled by gogols.</item>
  <item>Does not validate brief contents beyond parsing — brief validation is the parser's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: profile pipeline entry point.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Fix appRootDir resolution: use briefInputDir instead of inputDir so relative registryDbPath resolves from 3-extract-profile/.</item>
  <item>Add ${DEVICE_ID} substitution via getDeviceId in bootstrap-brief.ts.</item>
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
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { inputDir, briefInputDir, outputRootDir } from "../config.js";
import { getPagesDbName } from "../paths.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

/**
 * Resolves a DB path from brief relative to the app's root directory.
 * Absolute paths are returned as-is; relative paths are resolved from rootDir.
 */
const resolveDbPath = (dbPath: string, appRootDir: string): string => {
  if (path.isAbsolute(dbPath)) return dbPath;
  return path.resolve(appRootDir, dbPath);
};

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief } = await bootstrapBrief();

  const { year, quarter } = parseSourceToken(brief.sourceToken);
  // Quarter → half: Q1/Q2 → 1; Q3/Q4 → 2
  const half: 1 | 2 = quarter <= 2 ? 1 : 2;

  const pagesDbName = getPagesDbName(year, half);

  // Resolve both DB paths relative to the app root (parent of app-local .input/)
  const appRootDir = path.resolve(briefInputDir, "..");
  const resolvedRegistryDbPath = resolveDbPath(brief.registryDbPath, appRootDir);
  const resolvedLivenessDbPath = resolveDbPath(brief.livenessDbPath, appRootDir);

  console.log(`\n[site-profile] Pages DB:     ${pagesDbName}.db`);
  console.log(`[site-profile] registry.db:  ${resolvedRegistryDbPath}`);
  console.log(`[site-profile] liveness.db:  ${resolvedLivenessDbPath}\n`);

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
      pagesDbName,
      resolvedRegistryDbPath,
      resolvedLivenessDbPath,
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
