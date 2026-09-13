/*
<MODULE_CONTRACT>
<purpose>Entry point for the site-profile pipeline application — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform HTTP crawling or extraction directly — that is handled by gogols.</item>
  <item>Does not inspect upstream database contents; gogols validate and consume the databases after path fencing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix the operation to collect; reject diagnostic environment bypasses before creating output.</item>
  <item>Initial implementation: profile pipeline entry point.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Fix appRootDir resolution: use briefInputDir instead of inputDir so relative registryDbPath resolves from 3-extract-profile/.</item>
  <item>Add ${DEVICE_ID} substitution via getDeviceId in bootstrap-brief.ts.</item>
  <item>Fence the configured liveness input to the verified period/device database path.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from "@warpgogol/pipeline-core";
import { ensureOutputDir } from "@warpgogol/pipeline-node/context";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import {
  resolveQuarterScopedUpstreamDbPath,
  evaluateProgramGate,
  createBootstrapAdmission,
} from "@syrokomskyi/factory-core";
import { inputDir, briefInputDir, outputRootDir, factoryRootDir } from "../config.js";
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

  const { brief } = await bootstrapBrief();

  // RFC-0113: verified admission gate (bootstrap — all evidence refs null)
  const gate = evaluateProgramGate(
    createBootstrapAdmission({
      period: brief.sourceToken,
      capsuleId: brief.capsuleId,
      operation: "collect",
    }),
  );
  if (gate.status === "blocked") {
    throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
  }
  await ensureOutputDir(outputRootDir);

  const { year, quarter } = parseSourceToken(brief.sourceToken);
  const period = `${year}-q${quarter}`;
  const pagesDbName = getPagesDbName(period);

  // Resolve both DB paths relative to the app root (parent of app-local .input/)
  const appRootDir = path.resolve(briefInputDir, "..");
  const resolvedRegistryDbPath = resolveDbPath(brief.registryDbPath, appRootDir);
  const resolvedLivenessDbPath = resolveQuarterScopedUpstreamDbPath({
    configuredPath: brief.livenessDbPath,
    appRootDir,
    factoryRootDir,
    upstreamAppId: "2-check-liveness",
    deviceId: brief.deviceId,
    dbPrefix: "liveness",
    period,
  });

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
