/*
<MODULE_CONTRACT>
<purpose>Application entrypoint: bootstrap brief, resolve paths, then run the pipeline engine.</purpose>
<keywords>orchestration, entrypoint, bootstrap, pipeline-engine</keywords>
<responsibilities>
  <item>Bootstrap brief.md and resolve relative paths to absolute.</item>
  <item>Launch the pipeline engine after resolving paths and loading brief.</item>
</responsibilities>
<non-goals>
  <item>Do not implement gogol logic here.</item>
  <item>Do not manage database schema creation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="resolvePath">Convert possibly-relative paths to absolute against app root.</entry>
  <entry key="runApp">Main async entry: bootstrap → resolve → engine.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
  <item>Phase B cleanup: remove cohort/fixture logic; simplify to audit all live sites from registry.db using sourceToken.</item>
  <item>Use briefInputDir for appRootDir resolution (matches 3-extract-profile pattern).</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from '@org/pipeline-core';
import { ensureOutputDir } from '@org/pipeline-node/fs';
import { inputDir, briefInputDir, outputRootDir } from '../config.js';
import { createPipeline } from '../pipeline.js';
import { type PipelineRunOptions, runPipelineEngine } from '../pipeline/engine.js';
import { bootstrapBrief } from './input/bootstrap-brief.js';
import { parseSourceToken } from '@org/observatory-crypto';

const resolvePath = (p: string, appRootDir: string): string => {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
  return path.resolve(appRootDir, p);
};

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief } = await bootstrapBrief();

  const appRootDir = path.resolve(briefInputDir, '..');
  const resolvedRegistryDbPath = resolvePath(brief.registryDbPath, appRootDir);
  const resolvedLivenessDbPath = resolvePath(brief.livenessDbPath, appRootDir);

  // Derive year from sourceToken (B.1 cleanup)
  const { year } = parseSourceToken(brief.sourceToken);

  const liveTools: string[] = ['axe'];

  console.log(`\n[site-axe-audit] Year:           ${year}`);
  console.log(`[site-axe-audit] registry.db:    ${resolvedRegistryDbPath}`);
  console.log(`[site-axe-audit] liveness.db:    ${resolvedLivenessDbPath}`);
  console.log(`[site-axe-audit] Live tools:     ${liveTools.join(', ')}`);

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  console.log(
    `\n${formatPipelineStart({
      inputDir, outputDir: outputRootDir, pipelineTitle: guide.title,
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
      outputDir: outputRootDir, pipelineTitle: guide.title,
    })}`,
  );
};

