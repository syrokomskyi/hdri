/*
<MODULE_CONTRACT>
<purpose>Application entrypoint: bootstrap brief, resolve paths, then run the pipeline engine.</purpose>
<non-goals>
  <item>Do not implement gogol logic here.</item>
  <item>Do not manage database schema creation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix the operation to collect; reject diagnostic environment bypasses before creating output.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Phase B cleanup: remove cohort/fixture logic; simplify to audit all live sites from registry.db using sourceToken.</item>
  <item>Use briefInputDir for appRootDir resolution (matches 3-extract-profile pattern).</item>
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
import { resolveQuarterScopedUpstreamDbPath, evaluateProgramGate } from "@syrokomskyi/factory-core";
import { inputDir, briefInputDir, outputRootDir, factoryRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";

const resolvePath = (p: string, appRootDir: string): string => {
  if (!p) return "";
  if (path.isAbsolute(p)) return p;
  return path.resolve(appRootDir, p);
};

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);

  const { brief } = await bootstrapBrief();

  // RFC-0099: ProgramGate fail-closed check
  const gate = evaluateProgramGate({
    operation: "collect",
    period: brief.sourceToken,
    preservationRef: null,
    collectionReadinessRef: null,
    publicationReadinessRef: null,
  });
  if (gate.status === "blocked") {
    throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
  }
  await ensureOutputDir(outputRootDir);

  const appRootDir = path.resolve(briefInputDir, "..");
  const resolvedRegistryDbPath = resolvePath(brief.registryDbPath, appRootDir);

  // Derive year from sourceToken (B.1 cleanup)
  const { year, quarter } = parseSourceToken(brief.sourceToken);
  const period = `${year}-q${quarter}`;
  const resolvedLivenessDbPath = resolveQuarterScopedUpstreamDbPath({
    configuredPath: brief.livenessDbPath,
    appRootDir,
    factoryRootDir,
    upstreamAppId: "2-check-liveness",
    deviceId: brief.deviceId,
    dbPrefix: "liveness",
    period,
  });

  const liveTools: string[] = ["axe"];

  console.log(`\n[site-axe-audit] Year:           ${year}`);
  console.log(`[site-axe-audit] registry.db:    ${resolvedRegistryDbPath}`);
  console.log(`[site-axe-audit] liveness.db:    ${resolvedLivenessDbPath}`);
  console.log(`[site-axe-audit] Live tools:     ${liveTools.join(", ")}`);

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
