/*
<MODULE_CONTRACT>
<purpose>Orchestrates the contract-ontology pipeline execution lifecycle — this module handles run-app operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
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
import { evaluateProgramGate } from "@syrokomskyi/factory-core";
import { inputDir, outputRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief, ontology } = await bootstrapBrief();

  // RFC-0099: ProgramGate fail-closed check
  const gate = evaluateProgramGate({
    operation: (process.env.HDRI_OPERATION as "diagnostic" | "collect") ?? "collect",
    period: brief.period,
    preservationRef: null,
    collectionReadinessRef: null,
    publicationReadinessRef: null,
  });
  if (gate.status === "blocked") {
    throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
  }

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
