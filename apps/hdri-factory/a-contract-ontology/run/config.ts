/*
<MODULE_CONTRACT>
<purpose>Defines application-level directory paths and configuration for a-contract-ontology.</purpose>
<keywords>configuration, paths, directories</keywords>
<responsibilities>
  <item>Resolves root, input, output, evidence directories.</item>
  <item>Integrates device ID for output scoping.</item>
  <item>Provides upstream output roots for every numeric factory app.</item>
</responsibilities>
<non-goals>
  <item>Do not manage runtime state or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="inputDir">Path to the shared factory input directory.</entry>
  <entry key="outputRootDir">Path to the device-scoped output directory.</entry>
  <entry key="upstreamOutputRoots">Roots of every numeric factory app's .output/.</entry>
  <entry key="promptsDir">Path to app prompt templates directory.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
  <item>Add promptsDir for pipeline context.</item>
  <item>Add harvest output root for asset state discovery.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDeviceId } from '@org/observatory-crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const factoryRoot = path.resolve(rootDir, '..');

const deviceId = getDeviceId();

export const inputDir = path.join(rootDir, '..', '.input');
export const briefInputDir = path.join(rootDir, '.input');
export const outputRootDir = path.join(rootDir, '.output', deviceId);
export const evidenceDir = path.join(rootDir, '.evidence', deviceId);

/** Roots of every numeric factory app's `.output/` (parent of <deviceId>/). */
export const upstreamOutputRoots = {
  harvest:    path.join(factoryRoot, '0-harvest-source',     '.output'),
  registry:   path.join(factoryRoot, '1-register-businesses','.output'),
  liveness:   path.join(factoryRoot, '2-check-liveness',     '.output'),
  profile:    path.join(factoryRoot, '3-extract-profile',    '.output'),
  lighthouse: path.join(factoryRoot, '4-audit-lighthouse',   '.output'),
  axe:        path.join(factoryRoot, '5-audit-axe',          '.output'),
} as const;

export const promptsDir = path.join(rootDir, 'run', 'prompts');

export const localDeviceId = deviceId;
