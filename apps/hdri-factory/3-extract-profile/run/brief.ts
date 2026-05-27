/*
<MODULE_CONTRACT>
<purpose>Logic for parsing and validating the app-local brief.md configuration for site-profile.</purpose>
<keywords>brief, configuration, validation, gray-matter</keywords>
<responsibilities>
  <item>Defines the Brief type representing global site-profile configuration.</item>
  <item>Parses frontmatter from brief.md using gray-matter.</item>
  <item>Validates required fields (sourceToken, registryDbPath, livenessDbPath, zipcodesTablePath).</item>
  <item>Handles optional constraints (concurrency, timeout, maxDomains, rescan policy).</item>
</responsibilities>
<non-goals>
  <item>Do not manage filesystem I/O directly.</item>
  <item>Do not handle gogol-specific configurations beyond global brief scope.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Brief">Type definition for the application brief.</entry>
  <entry key="parseBriefMarkdown">Main function for transforming raw markdown into a validated Brief object.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation of brief parsing with validation.</item>
  <item>Add zipcodesTablePath field for geographic analysis reports.</item>
  <item>Phase B cleanup: remove deprecated profileYear, profileHalf, profileToken fields.</item>
  <item>Phase B cleanup: hardcode liveOnly, fetchDetectedPages, rescanPolicy, ontologyVersion, rulesetVersion, emitEnabled.</item>
  <item>Remove livenessBatchId; no longer needed with new architecture.</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>parseBriefMarkdown now accepts optional sharedSourceToken parameter for two-file brief pattern.</item>
  <item>Remove sharedSourceToken parameter; merge now handled centrally by mergeBriefFrontmatter from @org/pipeline-node.</item>
  <item>Update registryDbPath comment to reference 1-register-businesses instead of catalog-harvest.</item>
  <item>Add domCacheSize brief field with default 1000 for shared Cheerio DOM LRU cache.</item>
  <item>Revise domCacheSize comment to document realistic per-DOM RAM cost (~1–3 MB) and warn that 100k pages ≈ 100–300 GB.</item>
</CHANGE_SUMMARY>
*/

import matter from 'gray-matter';
import { parseSourceToken, getDeviceId } from '@org/observatory-crypto';

export type Brief = {
  /**
   * Canonical batch identifier in `yyyy-qn-cc[-extra]` format.
   * Sole axis of idempotency.
   */
  sourceToken: string;
  /**
   * Absolute or app-root-relative path to the 1-register-businesses registry.db.
   * Site-profile needs read-write access — it owns the site_pages table.
   */
  registryDbPath: string;
  /**
   * Absolute or app-root-relative path to the site-liveness liveness.db.
   * Opened read-only; used to filter live-only domains.
   */
  livenessDbPath: string;
  /**
   * Path to the zipcodes JSON file for geographic analysis.
   * Relative to app root or absolute path.
   */
  zipcodesTablePath: string | null;
  /** Device ID extracted from sourceToken. */
  deviceId: string;
  /** Year extracted from sourceToken. */
  year: number;
  /** Max concurrent page fetches. Default: 3. */
  concurrency: number;
  /** Per-fetch timeout in milliseconds. Default: 20 000. */
  timeoutMs: number;
  /** Max domains to profile. -1 = unlimited. */
  maxDomains: number;
  /** List of gogol IDs to skip during this run. */
  skipGogols: string[];
  /**
   * Max Cheerio DOM instances to keep in the shared LRU cache.
   * Each parsed DOM can easily consume 1–3 MB ( Cheerio tree + string buffers).
   * 100 000 unique pages ≈ 100–300 GB RAM — not feasible.
   * -1 = unlimited (keeps every page in memory; only safe for tiny batches).
   * 0 = disabled (parse on every access — not recommended).
   * Default: 2000 (≈ 2–6 GB peak, manageable on a 16 GB machine).
   */
  domCacheSize: number;
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const getFiniteNumber = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`brief.md: ${fieldName} must be a finite number when provided`);
};

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  const sourceTokenRaw = typeof data.sourceToken === 'string' ? data.sourceToken.trim() : '';
  if (!sourceTokenRaw) {
    throw new Error('brief.md: sourceToken must be provided in shared factory brief or local brief (e.g. "2026-q2-de")');
  }
  if (!/^[a-z0-9-]+$/.test(sourceTokenRaw)) {
    throw new Error(
      `brief.md: sourceToken must be lowercase kebab-case (a-z, 0-9, hyphens only). Got: "${sourceTokenRaw}"`,
    );
  }
  const parsedToken = parseSourceToken(sourceTokenRaw);

  const registryDbPath = typeof data.registryDbPath === 'string' ? data.registryDbPath.trim() : '';
  if (!registryDbPath) throw new Error('brief.md: registryDbPath must be a non-empty string');

  const livenessDbPath = typeof data.livenessDbPath === 'string' ? data.livenessDbPath.trim() : '';
  if (!livenessDbPath) throw new Error('brief.md: livenessDbPath must be a non-empty string');

  const zipcodesTablePath =
    typeof data.zipcodesTablePath === 'string' ? data.zipcodesTablePath.trim() || null : null;

  return {
    sourceToken: parsedToken.raw,
    registryDbPath,
    livenessDbPath,
    zipcodesTablePath,
    deviceId: getDeviceId(),
    year: parsedToken.year,
    concurrency: getFiniteNumber(data.concurrency, 'concurrency') ?? 3,
    timeoutMs: getFiniteNumber(data.timeoutMs, 'timeoutMs') ?? 20_000,
    maxDomains: getFiniteNumber(data.maxDomains, 'maxDomains') ?? -1,
    skipGogols: getStringArray(data.skipGogols),
    domCacheSize: getFiniteNumber(data.domCacheSize, 'domCacheSize') ?? 1_000,
  };
};

