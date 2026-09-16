/*
<MODULE_CONTRACT>
<purpose>Entry point for the 1-register-businesses pipeline application — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform core discovery or registry merging directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix the operation to collect; reject diagnostic environment bypasses before creating output.</item>
  <item>Extracted from main.ts into app/ for separation of concerns.</item>
</CHANGE_SUMMARY>
*/

import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from "@warpgogol/pipeline-core";
import { ensureOutputDir } from "@warpgogol/pipeline-node/context";
import { evaluateProgramGate, loadAdmissionInputFromFiles } from "@syrokomskyi/factory-core";
import { periodFromSourceToken } from "@syrokomskyi/observatory-crypto";
import { inputDir, outputRootDir, localDeviceId } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);

  const { brief, year, resolvedCoreDbPath, upstreamHarvestOutputRoot } = await bootstrapBrief();

  // RFC-0113: verify the explicit signed admission before creating outputs.
  const gate = evaluateProgramGate(
    await loadAdmissionInputFromFiles({
      admissionInputPath: options.admissionInputPath,
      evidenceRoot: options.admissionEvidenceRoot,
      trustedKeysPath: options.admissionTrustedKeysPath,
      trustedKeysSha256: options.admissionTrustedKeysSha256,
      requiredEvidenceClass: "operational",
      expected: {
        period: periodFromSourceToken(brief.sourceToken),
        capsuleId: brief.capsuleId,
        operation: "collect",
      },
    }),
  );
  if (gate.status === "blocked") {
    throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
  }
  await ensureOutputDir(outputRootDir);

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
      sourceToken: brief.sourceToken,
      year,
      deviceId: localDeviceId,
      resolvedCoreDbPath,
      upstreamHarvestOutputRoot,
      discoveredCores: [],
      domainAggregates: [],
      totalRowsRead: 0,
      dedupedCount: 0,
      registryRows: [],
      localDbPath: "",
      contentHash: "",
      brief,
    },
  });

  console.log(
    `\n${formatPipelineFinished({
      outputDir: outputRootDir,
      pipelineTitle: guide.title,
    })}`,
  );
};
