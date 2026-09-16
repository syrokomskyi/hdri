/*
<MODULE_CONTRACT>
<purpose>Orchestrates the contract-ontology pipeline execution lifecycle — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix the operation to collect; reject diagnostic environment bypasses before creating output.</item>
  <item>Add coreDbs: [] to initial pipeline state.</item>
  <item>Add axeDbs: [] to initial pipeline state.</item>
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
import { inputDir, outputRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);

  const { brief, ontology } = await bootstrapBrief();

  // RFC-0113: verify the explicit signed admission before creating outputs.
  const gate = evaluateProgramGate(
    await loadAdmissionInputFromFiles({
      admissionInputPath: options.admissionInputPath,
      evidenceRoot: options.admissionEvidenceRoot,
      trustedKeysPath: options.admissionTrustedKeysPath,
      requiredEvidenceClass: "operational",
      expected: {
        period: brief.period,
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
    clients: {},
    gogols: pipeline.steps,
    initialState: {
      brief,
      ontology,
      discoveredPages: [],
      coreDbs: [],
      livenessDbs: [],
      axeDbs: [],
      observationDbPath: null,
      signedObservationDbPath: null,
      manifest: null,
      verifiedSnapshots: [],
      translationClosure: null,
    },
    guide,
    options,
  });

  console.log(
    `\n${formatPipelineFinished({
      pipelineTitle: guide.title,
      outputDir: outputRootDir,
    })}`,
  );
};
