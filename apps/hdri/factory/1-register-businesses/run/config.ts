/*
<MODULE_CONTRACT>
<purpose>Defines application-level directory paths and configuration — this module handles config operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage runtime state or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill COMPASS scaffolding.</item>
  <item>inputDir now points to shared factory-level .input; briefInputDir added for app-local brief.md.</item>
  <item>Add transparencyDir for multi-device upstream signature verification.</item>
  <item>Compute transparencyDir from explicit repoRoot so it stays correct regardless of app nesting depth.</item>
  <item>Remove transparencyDir — now provided by getTransparencyKeysDir() from @syrokomskyi/observatory-crypto to avoid duplication.</item>
  <item>Add factoryRootDir and toFactoryRelativePath so pipeline artifacts show paths relative to apps/hdri/factory.</item>
  <item>Refactor to use shared factory utilities from @syrokomskyi/observatory-core.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
  <item>Remove upstreamHarvestOutputRoot export — now derived dynamically from brief.coreDbPath in main.ts so the upstream phase name is no longer hardcoded.</item>
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFactoryRelativePathConverter, getFactoryPaths } from "@syrokomskyi/factory-core";
import { getDeviceId } from "@syrokomskyi/observatory-crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

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
