/*
<MODULE_CONTRACT>
<purpose>Supports the initialization of batch processing by resolving the single batch folder that must exactly match brief.sourceToken.</purpose>
<keywords>batch initialization, error handling</keywords>
<responsibilities>
  <item>Resolves the batch directory whose name exactly equals brief.sourceToken.</item>
  <item>Throws a PipelinePauseError if the folder does not exist, providing guidance for resolution.</item>
  <item>Returns an object containing the single batch name for further processing.</item>
</responsibilities>
<non-goals>
  <item>Do not parse or validate the contents of batch files.</item>
  <item>Do not enumerate all directories under batches/ — only the one named by sourceToken.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBatches">Function to resolve the single batch folder matching sourceToken.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Enhanced GRACE scaffolding to accurately reflect module responsibilities and boundaries.</item>
  <item>Batch discovery now uses brief.sourceToken as the exact folder name instead of listing all batch directories.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import { PipelinePauseError } from '@org/pipeline-core';
import type { Brief } from '../../brief.js';
import { getBatchInputDir } from '../../paths.js';

export type BootstrappedBatches = {
  batchNames: string[];
};

export const bootstrapBatches = async (brief: Brief): Promise<BootstrappedBatches> => {
  const batchName = brief.sourceToken;
  const batchDir = getBatchInputDir(batchName);

  try {
    const stat = await fs.stat(batchDir);
    if (!stat.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    throw new PipelinePauseError(
      [
        'Pipeline paused.',
        `Batch directory not found: ${batchDir}`,
        `The folder name must exactly match sourceToken from brief.md ("${batchName}").`,
        '',
        'Expected structure:',
        `  .input/batches/${batchName}/firmenabc.com/*.csv`,
        `  .input/batches/${batchName}/<city>.stadtbranchenbuch.com/*.html`,
        `  .input/batches/${batchName}/branchenverzeichnis.org/**/*.html`,
        `  .input/batches/${batchName}/work5.de/**/*.html`,
      ].join('\n'),
    );
  }

  return { batchNames: [batchName] };
};

