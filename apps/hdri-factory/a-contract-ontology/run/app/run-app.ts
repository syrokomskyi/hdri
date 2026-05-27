/*
<MODULE_CONTRACT>
<purpose>Orchestrates the contract-ontology pipeline execution lifecycle.</purpose>
<keywords>pipeline execution, orchestration</keywords>
<responsibilities>
  <item>Bootstraps brief and ontology.</item>
  <item>Ensures output directories exist.</item>
  <item>Assembles and runs the pipeline via the shared engine.</item>
</responsibilities>
<non-goals>
  <item>Do not handle raw data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runApp">Main entry point for pipeline execution.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Add coreDbs: [] to initial pipeline state.</item>
  <item>Add axeDbs: [] to initial pipeline state.</item>
</CHANGE_SUMMARY>
*/

import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from '@org/pipeline-core';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { inputDir, outputRootDir } from '../config.js';
import { createPipeline } from '../pipeline.js';
import {
  type PipelineRunOptions,
  runPipelineEngine,
} from '../pipeline/engine.js';
import { bootstrapBrief } from './input/bootstrap-brief.js';

export const runApp = async (
  options: PipelineRunOptions = {},
): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief, ontology } = await bootstrapBrief();

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  console.log(`\n${formatPipelineStart({
    inputDir,
    outputDir: outputRootDir,
    pipelineTitle: guide.title,
  })}`);
  console.log(formatPipelineOverview(guide));

  await runPipelineEngine({
    clients: {},
    gogols: pipeline.steps,
    initialState: { brief, ontology, discoveredPages: [], coreDbs: [], axeDbs: [], allObs: [], resolvedObs: [], signed: [], manifest: null },
    guide,
    options,
  });

  console.log(`\n${formatPipelineFinished({
    pipelineTitle: guide.title,
    outputDir: outputRootDir,
  })}`);
};
