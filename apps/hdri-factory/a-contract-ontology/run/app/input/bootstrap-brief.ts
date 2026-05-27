/*
<MODULE_CONTRACT>
<purpose>Bootstraps a structured brief and loads the ontology for the contract-ontology pipeline.</purpose>
<keywords>bootstrapping, brief, ontology, validation</keywords>
<responsibilities>
  <item>Reads the shared factory-level brief.md and merges with app-local brief.md.</item>
  <item>Parses the merged brief into a validated Brief object.</item>
  <item>Loads ontology.yaml from .input/ with fallback to digital-observatory.</item>
  <item>Throws PipelinePauseError for missing or invalid input files.</item>
</responsibilities>
<non-goals>
  <item>Do not handle pipeline orchestration beyond input validation.</item>
  <item>Do not manage factory output discovery — that is done by DiscoverSourcesGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="bootstrapBrief">Function to initialize the brief and ontology.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Fix brief template to use canonical lowercase period format (2026-q2).</item>
  <item>Remove spurious parseBriefMarkdown call on root brief — root brief has no period and is not a full Brief.</item>
  <item>Fix ontology fallback path: add missing apps/ segment so it correctly resolves to apps/digital-observatory/.input/ontology.yaml.</item>
  <item>Add upstream DB paths to brief template (harvest, registry, liveness, profile, lighthouse, axe).</item>
  <item>Add ${DEVICE_ID} substitution before parsing local brief, matching other factory apps.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import matter from 'gray-matter';
import { PipelinePauseError } from '@org/pipeline-core';
import { readOntologyFile, type SignalOntology } from '@org/observatory-core';
import { getDeviceId } from '@org/observatory-crypto';
import { fileExists, readTextFile } from '@org/pipeline-node/fs';
import { mergeBriefFrontmatter } from '@org/pipeline-node/frontmatter';
import type { Brief } from '../../brief.js';
import { parseBriefMarkdown } from '../../brief.js';
import { inputDir, briefInputDir } from '../../config.js';

export type BootstrappedBrief = {
  brief: Brief;
  briefMd: string;
  rootBrief: Brief;
  ontology: SignalOntology;
};

const briefTemplate = `---
period: "2026-q2"
ontologyVersion: "1.0.0"

# Upstream database paths (read-only)
harvestDbPath: "../0-harvest-source/.output/<DEVICE>/data/db/core_2026.db"
registryDbPath: "../1-register-businesses/.output/<DEVICE>/data/db/registry_2026.db"
livenessDbPath: "../2-check-liveness/.output/<DEVICE>/data/db/liveness_2026.db"
profileDbPath: "../3-extract-profile/.output/<DEVICE>/data/db/pages-2026-h1.db"
lighthouseDbPath: "../4-audit-lighthouse/.output/<DEVICE>/data/db/lighthouse_2026.db"
axeDbPath: "../5-audit-axe/.output/<DEVICE>/data/db/axe_2026.db"

skipGogols: []
---
`;

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
        `Create ${path.relative(process.cwd(), localBriefPath)} and rerun.`,
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
        `Input file ${path.relative(process.cwd(), localBriefPath)} exists but is empty.`,
        'Fill it and rerun.',
        '',
        'Template:',
        briefTemplate,
      ].join('\n'),
    );
  }

  // Substitute ${DEVICE_ID} placeholder with the actual device ID before parsing
  const resolvedBriefMd = localBriefMd.replace(/\$\{DEVICE_ID\}/g, getDeviceId());
  const localParsed = matter(resolvedBriefMd);
  const localData = localParsed.data as Record<string, unknown>;

  // 3. Merge: app-local overrides root
  const mergedData = mergeBriefFrontmatter(rootData, localData);
  const mergedBriefMd = matter.stringify('', mergedData);

  let brief: Brief;
  try {
    brief = parseBriefMarkdown(mergedBriefMd);
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

  // 4. Load ontology
  const ontology = await loadOntology();
  console.log(`[bootstrap] Loaded ontology v${ontology.version} (${Object.keys(ontology.signals).length} signals)`);

  return { brief, briefMd: mergedBriefMd, rootBrief: {} as Brief, ontology };
};

async function loadOntology(): Promise<SignalOntology> {
  const ontologyPath = path.join(inputDir, 'ontology.yaml');
  try {
    return await readOntologyFile(ontologyPath);
  } catch {
    // Fall back to digital-observatory ontology
    const fallback = path.resolve(inputDir, '..', '..', 'digital-observatory', '.input', 'ontology.yaml');
    try {
      const ont = await readOntologyFile(fallback);
      console.log(`[bootstrap] Loaded ontology from observatory fallback; v${ont.version}, ${Object.keys(ont.signals).length} signals`);
      return ont;
    } catch {
      throw new Error(
        `Cannot load ontology from ${ontologyPath} or fallback ${fallback}`,
      );
    }
  }
}
