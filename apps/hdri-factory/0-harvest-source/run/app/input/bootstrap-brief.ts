/*
<MODULE_CONTRACT>
<purpose>Bootstraps a structured brief by merging the shared factory-level brief.md with the app-local brief.md.</purpose>
<keywords>bootstrapping, validation, merge, error handling</keywords>
<responsibilities>
  <item>Reads the shared factory-level brief.md (root) for common configuration like sourceToken.</item>
  <item>Reads the app-local brief.md for phase-specific overrides like maxSites.</item>
  <item>Merges both frontmatters with app-local values taking precedence.</item>
  <item>Parses the merged markdown content into a structured Brief object.</item>
  <item>Throws errors with detailed messages for missing or invalid input files.</item>
</responsibilities>
<non-goals>
  <item>Do not modify the brief data after parsing.</item>
  <item>Do not handle pipeline orchestration beyond input validation.</item>
  <item>Do not manage configurations or external dependencies unrelated to the brief file.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Function to initialize the brief by merging root + app-local frontmatter.</entry>
  <entry key="briefTemplate">Template for the expected structure of the brief markdown file.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Refined GRACE scaffolding to accurately reflect the function's role and responsibilities.</item>
  <item>Now reads from the shared factory-level .input directory.</item>
  <item>Template updated to reflect new brief format (sourceToken only).</item>
  <item>Read brief.md from app-local briefInputDir instead of shared inputDir so each phase has its own brief.</item>
  <item>Merge root brief.md with app-local brief.md: app-local values override root values.</item>
  <item>Return parsed rootBrief so gogols can read factory-level configuration directly.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import matter from 'gray-matter';
import { PipelinePauseError } from '@org/pipeline-core';
import { fileExists, readTextFile } from '@org/pipeline-node/fs';
import { mergeBriefFrontmatter } from '@org/pipeline-node/frontmatter';
import type { Brief } from '../../brief.js';
import { parseBriefMarkdown } from '../../brief.js';
import { inputDir, briefInputDir } from '../../config.js';

export type BootstrappedBrief = {
  brief: Brief;
  briefMd: string;
  /** Factory-level (root) brief, before app-local overrides. */
  rootBrief: Brief;
};

const briefTemplate = [
  '---',
  'sourceToken: "2026-q2-de"',
  '---',
  '',
].join('\n');

export const bootstrapBrief = async (): Promise<BootstrappedBrief> => {
  // 1. Read root (factory-level) brief if it exists
  const rootBriefPath = path.join(inputDir, 'brief.md');
  let rootData: Record<string, unknown> = {};
  const rootBriefExists = await fileExists(rootBriefPath);
  if (rootBriefExists) {
    const rootBriefMd = await readTextFile(rootBriefPath);
    if (rootBriefMd.trim().length > 0) {
      const parsed = matter(rootBriefMd);
      rootData = parsed.data as Record<string, unknown>;
    }
  }

  // 2. Read app-local brief (required)
  const localBriefPath = path.join(briefInputDir, 'brief.md');
  const localBriefExists = await fileExists(localBriefPath);

  if (!localBriefExists) {
    throw new PipelinePauseError(
      [
        'Pipeline paused.',
        'Missing required input file: brief.md',
        'Create apps/hdri-factory/0-harvest-source/.input/brief.md and rerun.',
        '',
        'Template:',
        briefTemplate,
      ].join('\n'),
    );
  }

  const localBriefMd = await readTextFile(localBriefPath);
  if (localBriefMd.trim().length === 0) {
    throw new PipelinePauseError(
      [
        'Pipeline paused.',
        'Input file brief.md exists but is empty.',
        'Fill it and rerun.',
        '',
        'Template:',
        briefTemplate,
      ].join('\n'),
    );
  }

  const localParsed = matter(localBriefMd);
  const localData = localParsed.data as Record<string, unknown>;

  // 3. Merge: app-local overrides root
  const mergedData = mergeBriefFrontmatter(rootData, localData);
  const mergedBriefMd = matter.stringify('', mergedData);

  try {
    const rootBriefMd = matter.stringify('', rootData);
    return {
      brief: parseBriefMarkdown(mergedBriefMd),
      briefMd: mergedBriefMd,
      rootBrief: parseBriefMarkdown(rootBriefMd),
    };
  } catch (error) {
    throw new PipelinePauseError(
      [
        'Pipeline paused.',
        'Merged brief.md is invalid:',
        error instanceof Error ? error.message : String(error),
        '',
        'Root brief:',
        JSON.stringify(rootData, null, 2),
        '',
        'Local brief:',
        JSON.stringify(localData, null, 2),
      ].join('\n'),
    );
  }
};

