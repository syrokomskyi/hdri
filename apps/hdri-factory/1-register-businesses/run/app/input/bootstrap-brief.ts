/*
<MODULE_CONTRACT>
<purpose>Bootstrap and merge briefs for 1-register-businesses pipeline.</purpose>
<keywords>brief, bootstrap, configuration</keywords>
<responsibilities>
  <item>Reads shared factory brief.md and local app-level brief.md.</item>
  <item>Merges frontmatter using mergeBriefFrontmatter.</item>
  <item>Substitutes ${DEVICE_ID} placeholder in local brief.</item>
  <item>Returns parsed Brief and parsed root brief data.</item>
</responsibilities>
<non-goals>
  <item>Do not handle pipeline execution.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Main function for loading and merging brief files.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extracted from main.ts into app/input/ for separation of concerns.</item>
</CHANGE_SUMMARY>
*/

import fsp from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { parseSourceToken } from '@org/observatory-crypto';
import { mergeBriefFrontmatter } from '@org/pipeline-node/frontmatter';
import { parseBriefMarkdown } from '../../brief.js';
import { inputDir, briefInputDir, localDeviceId } from '../../config.js';

export type BootstrapBriefResult = {
  brief: ReturnType<typeof parseBriefMarkdown>;
  rootBrief: Record<string, unknown>;
  year: number;
  resolvedCoreDbPath: string;
  upstreamHarvestOutputRoot: string;
};

export const bootstrapBrief = async (): Promise<BootstrapBriefResult> => {
  const sharedBriefPath = path.join(inputDir, 'brief.md');
  const sharedBriefMd = await fsp.readFile(sharedBriefPath, 'utf-8');
  const sharedParsed = matter(sharedBriefMd);
  const sharedData = sharedParsed.data as Record<string, unknown>;

  const localBriefPath = path.join(briefInputDir, 'brief.md');
  const localBriefMd = await fsp.readFile(localBriefPath, 'utf-8');
  const resolvedLocalBriefMd = localBriefMd.replace(/\$\{DEVICE_ID\}/g, localDeviceId);
  const localParsed = matter(resolvedLocalBriefMd);
  const localData = localParsed.data as Record<string, unknown>;

  const mergedData = mergeBriefFrontmatter(sharedData, localData);
  const mergedBriefMd = matter.stringify('', mergedData);
  const brief = parseBriefMarkdown(mergedBriefMd);

  const appRootDir = path.resolve(briefInputDir, '..');
  const resolvedCoreDbPath = path.resolve(appRootDir, brief.coreDbPath);
  const upstreamHarvestOutputRoot = path.resolve(resolvedCoreDbPath, '..', '..', '..', '..');

  const { year } = parseSourceToken(brief.sourceToken);

  return { brief, rootBrief: sharedData, year, resolvedCoreDbPath, upstreamHarvestOutputRoot };
};
