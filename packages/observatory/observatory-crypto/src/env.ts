/*
<MODULE_CONTRACT>
<purpose>Manages repository root discovery, environment loading, device identity validation, and auto-loading entry point for ESM import hoisting.</purpose>
<non-goals>
  <item>Does not handle source token parsing or device folder enumeration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from device.ts — env loading and device identity only.</item>
  <item>Added autoLoadEnv() to consolidate auto-env.ts side-effect into env.ts.</item>
</CHANGE_SUMMARY>
*/

/**
 * Device identity helpers — read DEVICE_ID from environment.
 *
 * Companion to loadSigningKeyFromEnv() in sign.ts. Both rely on the same
 * .env-based convention.
 */

import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

const IGNORED_PREFIX = "-";

/**
 * Walks up from the current working directory until a `pnpm-workspace.yaml`
 * is found, returning the repository root path.
 *
 * @throws if the workspace root cannot be found within 8 levels.
 */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find repo root (pnpm-workspace.yaml not found within 8 levels).");
}

/**
 * Loads the repository-level `.env` file by walking up from the current working
 * directory until a `.env` file or `pnpm-workspace.yaml` is found.
 *
 * Each factory app's `main.ts` should call this once at the top, replacing
 * `import 'dotenv/config'` (which only looks at process.cwd()).
 *
 * Idempotent — calling it multiple times is safe.
 */
export function loadRepoEnv(): void {
  let dir = process.cwd();
  // Walk up at most 8 levels to avoid runaway loops on misconfigured CI.
  for (let i = 0; i < 8; i++) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      dotenvConfig({ path: envPath });
      return;
    }
    const workspaceMarker = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(workspaceMarker)) {
      // Found repo root but no .env — silently continue; caller will fail loud
      // if a required var is missing.
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * Reads DEVICE_ID from the environment, validates it, and returns it.
 *
 * Validation:
 *   - non-empty after trim
 *   - does not start with `-` (reserved for ignoring devices)
 *   - no filesystem-invalid characters
 *
 * @throws if the value is missing or invalid.
 */
export function getDeviceId(): string {
  const raw = process.env.DEVICE_ID?.trim();
  if (!raw) {
    throw new Error("DEVICE_ID env var is required. Run `pnpm setup:device-id` to provision one.");
  }
  if (raw.startsWith(IGNORED_PREFIX)) {
    throw new Error(
      `DEVICE_ID must not start with "${IGNORED_PREFIX}" (reserved for ignored device folders). Got: ${raw}`,
    );
  }
  if (/[\\/:*?"<>|]/.test(raw)) {
    throw new Error(`DEVICE_ID contains invalid filesystem characters: ${raw}`);
  }
  return raw;
}

/**
 * Loads the repository-level .env at module evaluation time.
 *
 * This is the explicit alternative to the `auto-env` side-effect import:
 *
 *   import { autoLoadEnv } from '@syrokomskyi/observatory-crypto';
 *   autoLoadEnv();
 *
 * The `auto-env` subpath export remains as a thin wrapper around this function
 * for consumers that prefer the side-effect import pattern.
 */
export function autoLoadEnv(): void {
  loadRepoEnv();
}
