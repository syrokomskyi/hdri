/*
<MODULE_CONTRACT>
<purpose>Entry point for the 1-register-businesses pipeline application.</purpose>
<keywords>pipeline, entry point, registration, registry</keywords>
<responsibilities>
  <item>Bootstrap the brief from shared factory .input and local .input.</item>
  <item>Ensure input and output directories exist.</item>
  <item>Create the pipeline definition and run the pipeline engine.</item>
  <item>Format and display pipeline start/finish/overview messages.</item>
</responsibilities>
<non-goals>
  <item>Does not perform core discovery or registry merging directly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runApp">Main async function that orchestrates the register-businesses pipeline execution.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extracted from main.ts into app/ for separation of concerns.</item>
</CHANGE_SUMMARY>
*/

import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from '@org/pipeline-core';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { inputDir, outputRootDir, localDeviceId } from '../config.js';
import { createPipeline } from '../pipeline.js';
import { type PipelineRunOptions, runPipelineEngine } from '../pipeline/engine.js';
import { bootstrapBrief } from './input/bootstrap-brief.js';

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief, year, resolvedCoreDbPath, upstreamHarvestOutputRoot } =
    await bootstrapBrief();

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
      localDbPath: '',
      contentHash: '',
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
