/*
<MODULE_CONTRACT>
<purpose>Defines application-level directory paths and configuration.</purpose>
<keywords>configuration, paths, directories</keywords>
<responsibilities>
  <item>Resolves root, input, output, evidence, and prompts directories.</item>
  <item>Integrates device ID for output scoping.</item>
</responsibilities>
<non-goals>
  <item>Do not manage runtime state or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="inputDir">Path to the app input directory.</entry>
  <entry key="outputRootDir">Path to the device-scoped output directory.</entry>
  <entry key="evidenceDir">Path to the device-scoped evidence directory.</entry>
  <entry key="promptsDir">Path to the app prompts directory.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding.</item>
  <item>inputDir now points to the shared factory-level .input directory.</item>
  <item>Add briefInputDir for app-local brief.md so each phase reads its own configuration.</item>
  <item>Add factoryRootDir and toFactoryRelativePath so pipeline artifacts show paths relative to apps/hdri-factory.</item>
  <item>Refactor to use shared factory utilities from @org/observatory-core.</item>
</CHANGE_SUMMARY>
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

/**
 * Repository convention: every factory app writes its outputs under a
 * .output/<DEVICE_ID>/ subtree, so artifacts from different machines can be
 * copied into the same repo without filename collisions and a-contract-ontology
 * can walk all sibling devices in one pass.
 *
 * Input conventions:
 * - brief.md is app-local: each phase reads its own brief from its own .input/
 * - batches/ and other shared data remain at the factory level
 */
const deviceId = getDeviceId();
const paths = getFactoryPaths(rootDir, scriptDir, deviceId);

export const inputDir = paths.inputDir;
export const briefInputDir = paths.briefInputDir;
export const outputRootDir = paths.outputRootDir;
export const evidenceDir = paths.evidenceDir;
export const promptsDir = paths.promptsDir;

/** Convert an absolute path to a relative one from the hdri-factory root. */
export const toFactoryRelativePath = createFactoryRelativePathConverter(rootDir);