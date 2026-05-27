/*
<MODULE_CONTRACT>
<purpose>Bootstraps a structured brief from the shared factory-level brief.md.</purpose>
<keywords>bootstrapping, validation, error handling</keywords>
<responsibilities>
  <item>Verifies the existence of the brief markdown file in the shared factory input directory.</item>
  <item>Reads the content of the brief markdown file and checks for emptiness.</item>
  <item>Parses the markdown content into a structured Brief object.</item>
  <item>Throws errors with detailed messages for missing or invalid input files.</item>
</responsibilities>
<non-goals>
  <item>Do not modify the brief data after parsing.</item>
  <item>Do not handle pipeline orchestration beyond input validation.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Function to initialize the brief from the shared factory-level brief.md.</entry>
  <entry key="briefTemplate">Template for the expected structure of the brief markdown file.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Two-file brief pattern: reads sourceToken from shared factory-level brief.md, other settings from local app-level brief.md.</item>
  <item>Use shared mergeBriefFrontmatter from @org/pipeline-node for merging root + local brief frontmatter.</item>
  <item>Use inputDir/briefInputDir from config instead of inline path resolution.</item>
  <item>Fix localBriefTemplate registryDbPath placeholder from <DEVICE> to ${DEVICE_ID} to match the regex substitution in bootstrapBrief.</item>
  <item>Update localBriefTemplate registryDbPath to point to 1-register-businesses instead of 0-harvest-source.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import matter from 'gray-matter';
import { PipelinePauseError } from '@org/pipeline-core';
import { fileExists, readTextFile } from '@org/pipeline-node/fs';
import { mergeBriefFrontmatter } from '@org/pipeline-node/frontmatter';
import { getDeviceId } from '@org/observatory-crypto';
import type { Brief } from '../../brief.js';
import { parseBriefMarkdown } from '../../brief.js';
import { inputDir, briefInputDir } from '../../config.js';

export type BootstrappedBrief = {
  brief: Brief;
  briefMd: string;
};

const localBriefTemplate = [
  '---',
  'registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"',
  'concurrency: 5',
  'timeoutMs: 10000',
  'retryCount: 1',
  'maxDomains: -1',
  'skipGogols: []',
  '---',
  '',
].join('\n');

export const bootstrapBrief = async (): Promise<BootstrappedBrief> => {
  // 1. Read shared factory brief.md (root config)
  const sharedBriefPath = path.join(inputDir, 'brief.md');
  let sharedData: Record<string, unknown> = {};
  const sharedExists = await fileExists(sharedBriefPath);
  if (sharedExists) {
    const sharedBriefMd = await readTextFile(sharedBriefPath);
    if (sharedBriefMd.trim().length > 0) {
      const parsed = matter(sharedBriefMd);
      sharedData = parsed.data as Record<string, unknown>;
    }
  }

  // 2. Read local app-level brief.md (required)
  const localBriefPath = path.join(briefInputDir, 'brief.md');
  if (!await fileExists(localBriefPath)) {
    throw new PipelinePauseError(
      ['Pipeline paused.', 'Missing local brief.md', '', 'Template:', localBriefTemplate].join('\n'),
    );
  }
  const localBriefMd = await readTextFile(localBriefPath);
  if (!localBriefMd.trim()) {
    throw new PipelinePauseError(
      ['Pipeline paused.', 'Local brief.md is empty.', '', 'Template:', localBriefTemplate].join('\n'),
    );
  }
  // Substitute ${DEVICE_ID} placeholder with the actual device ID
  const resolvedBriefMd = localBriefMd.replace(/\$\{DEVICE_ID\}/g, getDeviceId());
  const localParsed = matter(resolvedBriefMd);
  const localData = localParsed.data as Record<string, unknown>;

  // 3. Merge: local overrides shared, then parse unified brief
  const mergedData = mergeBriefFrontmatter(sharedData, localData);
  const mergedBriefMd = matter.stringify('', mergedData);

  try {
    const brief = parseBriefMarkdown(mergedBriefMd);
    return { brief, briefMd: mergedBriefMd };
  } catch (error) {
    throw new PipelinePauseError(
      ['Pipeline paused.', 'Merged brief.md is invalid:', error instanceof Error ? error.message : String(error), '', 'Template:', localBriefTemplate].join('\n'),
    );
  }
};

