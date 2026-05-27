/*
<MODULE_CONTRACT>
<purpose>Bootstrap the brief.md input file using two-file pattern: shared factory-level for sourceToken, app-level for settings.</purpose>
<keywords>input, bootstrap, brief, template, pause</keywords>
<responsibilities>
  <item>Read sourceToken from shared factory .input/brief.md.</item>
  <item>Read other settings from local app-level .input/brief.md.</item>
  <item>Parse merged frontmatter into a typed Brief object.</item>
</responsibilities>
<non-goals>
  <item>Do not resolve cohortId from the database.</item>
  <item>Do not validate file system paths beyond existence.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Load, validate, and parse brief.md from both shared and local input.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Update template comment for cohortId to indicate it is optional when registry.db contains exactly one cohort.</item>
  <item>Add GRACE scaffolding.</item>
  <item>Two-file brief pattern: reads sourceToken from shared factory-level brief.md, other settings from local app-level brief.md.</item>
  <item>Use shared mergeBriefFrontmatter from @org/pipeline-node for merging root + local brief frontmatter.</item>
  <item>Use inputDir/briefInputDir from config instead of inline path resolution.</item>
  <item>Add ${DEVICE_ID} substitution before parsing frontmatter (matches 3-extract-profile pattern).</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import matter from 'gray-matter';
import { PipelinePauseError } from '@org/pipeline-core';
import { fileExists, readTextFile } from '@org/pipeline-node/fs';
import { mergeBriefFrontmatter } from '@org/pipeline-node/frontmatter';
import { getDeviceId } from '@org/observatory-crypto';
import { parseBriefMarkdown } from '../../brief.js';
import { inputDir, briefInputDir } from '../../config.js';
import type { Brief } from '../../brief.js';

export type BootstrappedBrief = { brief: Brief; briefMd: string };

const localBriefTemplate = [
  '---',
  'registryDbPath: "../1-register-businesses/.output/<DEVICE>/data/db/registry_2026.db"',
  'concurrency: 2',
  'timeoutMs: 60000',
  'retries: 2',
  'skipGogols: []',
  '---',
  '',
].join('\n');

export const bootstrapBrief = async (): Promise<BootstrappedBrief> => {
  // 1. Read shared factory brief.md (root config)
  const sharedBriefPath = path.join(inputDir, 'brief.md');
  let sharedData: Record<string, unknown> = {};
  if (await fileExists(sharedBriefPath)) {
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
  // Substitute ${DEVICE_ID} placeholder with the actual device ID before parsing
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
      ['Pipeline paused.', 'Merged brief.md invalid:', error instanceof Error ? error.message : String(error), '', 'Template:', localBriefTemplate].join('\n'),
    );
  }
};

