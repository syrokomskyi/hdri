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
  <item>Add auto-cohort resolution from registry.db when cohortId is missing (0 or >1 still fail).</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Remove lighthouse prefix from brief field references - this app is Lighthouse-only.</item>
  <item>Phase B cleanup: use sourceToken instead of removed auditYear field.</item>
  <item>Phase B cleanup: remove cohortId and fixtureDir references (audit all live businesses).</item>
  <item>Remove auditBatchId generation and passing; pipeline no longer uses batch IDs.</item>
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
import { periodFromSourceToken } from "@syrokomskyi/observatory-crypto";
import { resolveQuarterScopedUpstreamDbPath, evaluateProgramGate } from "@syrokomskyi/factory-core";
import { inputDir, briefInputDir, outputRootDir, factoryRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

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
  const resolvedLivenessDbPath = resolveQuarterScopedUpstreamDbPath({
    configuredPath: brief.livenessDbPath,
    appRootDir,
    factoryRootDir,
    upstreamAppId: "2-check-liveness",
    deviceId: brief.deviceId,
    dbPrefix: "liveness",
    period: periodFromSourceToken(brief.sourceToken),
  });

  console.log(`\n[site-lighthouse-audit] Source token:   ${brief.sourceToken}`);
  console.log(`[site-lighthouse-audit] registry.db:    ${resolvedRegistryDbPath}`);
  console.log(`[site-lighthouse-audit] liveness.db:    ${resolvedLivenessDbPath}`);
  console.log(`[site-lighthouse-audit] Live tools:     lighthouse`);

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
