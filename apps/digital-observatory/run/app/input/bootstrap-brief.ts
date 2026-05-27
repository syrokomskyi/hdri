/*
<MODULE_CONTRACT>
<purpose>Loads and validates the observatory brief from .input/brief.md.</purpose>
<keywords>brief, input, bootstrap</keywords>
<responsibilities>
  <item>Reads .input/brief.md and parses it into a Brief object.</item>
  <item>Raises PipelinePauseError with a template when brief is missing or invalid.</item>
</responsibilities>
<non-goals>
  <item>Do not validate source data availability — that is done by gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Loads brief or pauses pipeline with a template.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>Fix brief template to use canonical lowercase period format (2025-q2).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PipelinePauseError } from '@org/pipeline-core';
import { inputDir } from '../../config';
import { parseBriefMarkdown, type Brief } from '../../brief';

const BRIEF_TEMPLATE = `---
outputLanguage: de
period: "2025-q2"
ontologyVersion: "1.0.0"
codebookVersion: "hdri-v1.0.0"
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---

Digital Observatory run brief.
`;

export const bootstrapBrief = async (): Promise<{ brief: Brief }> => {
  const briefPath = path.join(inputDir, 'brief.md');

  let briefMd: string;
  try {
    briefMd = await readFile(briefPath, 'utf-8');
  } catch {
    throw new PipelinePauseError(
      `Missing .input/brief.md — create it at:\n  ${briefPath}\n\nTemplate:\n\n${BRIEF_TEMPLATE}`,
    );
  }

  if (!briefMd.trim()) {
    throw new PipelinePauseError(
      `Empty .input/brief.md — fill it in at:\n  ${briefPath}\n\nTemplate:\n\n${BRIEF_TEMPLATE}`,
    );
  }

  const brief = parseBriefMarkdown(briefMd);
  return { brief };
};
