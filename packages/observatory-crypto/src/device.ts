/**
 * Device identity helpers — read DEVICE_ID from environment.
 *
 * Companion to loadSigningKeyFromEnv() in sign.ts. Both rely on the same
 * .env-based convention.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

const IGNORED_PREFIX = '-';

/**
 * Walks up from the current working directory until a `pnpm-workspace.yaml`
 * is found, returning the repository root path.
 *
 * @throws if the workspace root cannot be found within 8 levels.
 */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find repo root (pnpm-workspace.yaml not found within 8 levels).');
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
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      dotenvConfig({ path: envPath });
      return;
    }
    const workspaceMarker = path.join(dir, 'pnpm-workspace.yaml');
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
    throw new Error(
      'DEVICE_ID env var is required. Run `pnpm setup:device-id` to provision one.',
    );
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
 * Returns true when a folder name represents a device whose data should be
 * ignored by downstream pipelines (e.g. "-stale-laptop").
 *
 * Used by 1-register-businesses and a-contract-ontology when walking sibling
 * `.output/` directories to collect data from multiple machines.
 */
export function isIgnoredDeviceFolder(folderName: string): boolean {
  return folderName.startsWith(IGNORED_PREFIX);
}

/**
 * Canonical sourceToken format: `yyyy-qn-cc[-extra]`
 *
 *   yyyy  — calendar year (≥ 2020)
 *   qn    — quarter (q1..q4); period boundary is hard-coded by quarter
 *   cc    — ISO 3166-1 alpha-2 country code (e.g. de, at, ch)
 *   extra — optional descriptive suffix (lowercase letters, digits, hyphen)
 *
 * Examples: "2026-q2-de", "2026-q2-de-test1", "2027-q4-at-mannheim-pilot"
 */
const SOURCE_TOKEN_RE = /^(\d{4})-[Qq]([1-4])-([A-Za-z]{2})(-[a-zA-Z0-9-]+)?$/;

export type ParsedSourceToken = {
  readonly raw: string;
  readonly year: number;
  readonly quarter: 1 | 2 | 3 | 4;
  readonly country: string;
  readonly extra: string | null;
};

export function parseSourceToken(token: string): ParsedSourceToken {
  const trimmed = token.trim();
  const m = SOURCE_TOKEN_RE.exec(trimmed);
  if (!m) {
    throw new Error(
      `Invalid sourceToken "${token}". Expected yyyy-qn-cc[-extra], e.g. "2026-q2-de-test1".`,
    );
  }
  const year = parseInt(m[1]!, 10);
  if (year < 2020) throw new Error(`sourceToken year must be ≥ 2020 (got ${year})`);
  return {
    raw: trimmed,
    year,
    quarter: parseInt(m[2]!, 10) as 1 | 2 | 3 | 4,
    country: m[3]!.toLowerCase(),
    extra: m[4]?.slice(1) ?? null,
  };
}

/** Returns the period (`yyyy-qn`) implied by a sourceToken — used by a-contract-ontology. */
export function periodFromSourceToken(token: string): string {
  const p = parseSourceToken(token);
  return `${p.year}-q${p.quarter}`;
}

/**
 * Returns true when a sourceToken belongs to the given period.
 * E.g. periodMatchesToken("2026-q2", "2026-q2-de-test1") === true.
 */
export function periodMatchesToken(period: string, token: string): boolean {
  return periodFromSourceToken(token) === period;
}

/**
 * Walks the immediate subdirectories of a parent `.output/` folder, returning
 * one entry per device folder. Folders whose name starts with `-` (ignored)
 * are skipped.
 *
 * Used by 1-register-businesses (over `0-harvest-source/.output/`) and
 * a-contract-ontology (over `0..5/.output/`) to find data from all
 * collaborating machines without enumeration in brief.md.
 */
export async function listDeviceFolders(parentOutputDir: string): Promise<{
  deviceId: string;
  path: string;
}[]> {
  let entries;
  try {
    entries = await fsp.readdir(parentOutputDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { deviceId: string; path: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = String(e.name);
    if (isIgnoredDeviceFolder(name)) continue;
    out.push({ deviceId: name, path: path.join(parentOutputDir, name) });
  }
  return out;
}
