/*
<MODULE_CONTRACT>
<purpose>Defines application-level directory paths and configuration for a-contract-ontology — this module handles config operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage runtime state or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
  <item>Add promptsDir for pipeline context.</item>
  <item>Add harvest output root for asset state discovery.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeviceId } from "@syrokomskyi/observatory-crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const factoryRoot = path.resolve(rootDir, "..");

const deviceId = getDeviceId();

export const inputDir = path.join(rootDir, "..", ".input");
export const briefInputDir = path.join(rootDir, ".input");
export const outputRootDir = path.join(rootDir, ".output", deviceId);
export const evidenceDir = path.join(rootDir, ".evidence", deviceId);

/** Roots of every numeric factory app's `.output/` (parent of <deviceId>/). */
export const upstreamOutputRoots = {
  harvest: path.join(factoryRoot, "0-harvest-source", ".output"),
  registry: path.join(factoryRoot, "1-register-businesses", ".output"),
  liveness: path.join(factoryRoot, "2-check-liveness", ".output"),
  profile: path.join(factoryRoot, "3-extract-profile", ".output"),
  lighthouse: path.join(factoryRoot, "4-audit-lighthouse", ".output"),
  axe: path.join(factoryRoot, "5-audit-axe", ".output"),
} as const;

export const promptsDir = path.join(rootDir, "run", "prompts");

export const localDeviceId = deviceId;
