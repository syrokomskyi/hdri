/*
<MODULE_CONTRACT>
<purpose>Facilitates the execution of the catalog harvest pipeline, managing input and output directories.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or validation within this module.</item>
  <item>Do not manage configuration or orchestration of transport layers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added COMPASS scaffolding to define module purpose, responsibilities, and boundaries.</item>
  <item>Phase B cleanup: derive year/quarter from sourceToken instead of removed deprecated fields.</item>
  <item>Pass brief into bootstrapBatches so batch discovery is driven by sourceToken.</item>
  <item>Add maxSites logging at pipeline start for operational visibility.</item>
  <item>Replace maxSites log with maxPages log.</item>
  <item>Pass rootBrief into pipeline initialState so gogols can read factory-level configuration.</item>
</CHANGE_SUMMARY>
*/

import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from "@syrokomskyi/pipeline-core";
import { ensureOutputDir } from "@syrokomskyi/pipeline-node/context";
import { inputDir, outputRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBatches } from "./input/bootstrap-batches.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief, rootBrief } = await bootstrapBrief();
  const { batchNames } = await bootstrapBatches(brief);

  console.log(`\n[catalog-harvest] Batches found: ${batchNames.join(", ")}`);
  console.log(`[catalog-harvest] maxPages: ${brief.maxPages}\n`);

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
      batchNames,
      brief,
      rootBrief,
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
