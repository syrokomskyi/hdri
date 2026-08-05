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
  <item>Add factoryRootDir and toFactoryRelativePath so pipeline artifacts show paths relative to apps/hdri/factory.</item>
  <item>Refactor to use shared factory utilities from @syrokomskyi/observatory-core.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFactoryRelativePathConverter,
  getFactoryPaths,
  getUpstreamOutputRoot,
} from "@syrokomskyi/factory-core";
import { getDeviceId } from "@syrokomskyi/observatory-crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

/**
 * Repository convention: every factory app writes its outputs under a
 * .output/<DEVICE_ID>/ subtree, so artifacts from different machines can be
 * copied into the same repo without filename collisions and a-contract-ontology
 * can walk all sibling devices in one pass.
 *
 * Input is shared at the factory level: apps/hdri/factory/.input/
 */
const deviceId = getDeviceId();
const paths = getFactoryPaths(rootDir, scriptDir, deviceId);

export const inputDir = paths.inputDir;
export const briefInputDir = paths.briefInputDir;
export const outputRootDir = paths.outputRootDir;
export const evidenceDir = paths.evidenceDir;
export const promptsDir = paths.promptsDir;
export const factoryRootDir = paths.factoryRootDir;

/**
 * Root of the upstream 2-check-liveness pipeline output.
 * Used by VerifyUpstreamGogol to locate source-signature.json manifests.
 */
export const upstreamLivenessOutputRoot = getUpstreamOutputRoot(
  paths.factoryRootDir,
  "2-check-liveness",
);

/** Convert an absolute path to a relative one from the factory root. */
export const toFactoryRelativePath = createFactoryRelativePathConverter(rootDir);
