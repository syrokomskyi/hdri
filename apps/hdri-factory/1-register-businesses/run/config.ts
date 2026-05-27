/*
<MODULE_CONTRACT>
<purpose>Defines application-level directory paths and configuration.</purpose>
<keywords>configuration, paths, directories</keywords>
<responsibilities>
  <item>Resolves root, input, output, evidence directories.</item>
  <item>Integrates device ID for output scoping.</item>
  <item>Provides upstream harvest output path for reading core.db.</item>
</responsibilities>
<non-goals>
  <item>Do not manage runtime state or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="inputDir">Path to the shared factory input directory.</entry>
  <entry key="outputRootDir">Path to the device-scoped output directory.</entry>
  <entry key="evidenceDir">Path to the device-scoped evidence directory.</entry>
  <entry key="transparency keys">Resolved by getTransparencyKeysDir() from @org/observatory-crypto.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding.</item>
  <item>inputDir now points to shared factory-level .input; briefInputDir added for app-local brief.md.</item>
  <item>Add transparencyDir for multi-device upstream signature verification.</item>
  <item>Compute transparencyDir from explicit repoRoot so it stays correct regardless of app nesting depth.</item>
  <item>Remove transparencyDir — now provided by getTransparencyKeysDir() from @org/observatory-crypto to avoid duplication.</item>
  <item>Add factoryRootDir and toFactoryRelativePath so pipeline artifacts show paths relative to apps/hdri-factory.</item>
  <item>Refactor to use shared factory utilities from @org/observatory-core.</item>
</CHANGE_SUMMARY>
  <item>Remove upstreamHarvestOutputRoot export — now derived dynamically from brief.coreDbPath in main.ts so the upstream phase name is no longer hardcoded.</item>
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFactoryRelativePathConverter,
  getFactoryPaths,
} from '@org/observatory-core';
import { getDeviceId } from '@org/observatory-crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const deviceId = getDeviceId();
const paths = getFactoryPaths(rootDir, scriptDir, deviceId);

export const inputDir = paths.inputDir;
export const briefInputDir = paths.briefInputDir;
export const outputRootDir = paths.outputRootDir;
export const evidenceDir = paths.evidenceDir;
export const promptsDir = paths.promptsDir;

/** Parent of all devices' .output for the upstream 0-harvest-source app. */
export const toFactoryRelativePath = createFactoryRelativePathConverter(rootDir);

export const localDeviceId = deviceId;
