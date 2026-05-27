/*
<MODULE_CONTRACT>
<purpose>Logic for parsing and validating the shared factory-level brief.md configuration.</purpose>
<keywords>brief, configuration, validation, gray-matter</keywords>
<responsibilities>
  <item>Defines the Brief type representing global harvest configuration.</item>
  <item>Parses frontmatter from brief.md using gray-matter.</item>
  <item>Validates required fields (sourceToken, registryDbPath).</item>
</responsibilities>
<non-goals>
  <item>Do not manage filesystem I/O directly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Brief">Type definition for the application brief.</entry>
  <entry key="parseBriefMarkdown">Main function for transforming raw markdown into a validated Brief object.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation of brief parsing with validation.</item>
  <item>Remove harvestBatchFilter; no longer needed with new architecture.</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>parseBriefMarkdown now accepts optional sharedSourceToken parameter for two-file brief pattern.</item>
  <item>Remove sharedSourceToken parameter; merge now handled centrally by mergeBriefFrontmatter from @org/pipeline-node.</item>
  <item>Update registryDbPath comment to reference 1-register-businesses instead of catalog-harvest.</item>
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
   * Example: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
   */
  registryDbPath: string;
  /** Device ID extracted from sourceToken. */
  deviceId: string;
  /** Year extracted from sourceToken. */
  year: number;
  /** Max concurrent HTTP checks in flight. Default: 5. */
  concurrency: number;
  /** Per-domain HTTP timeout in milliseconds. Default: 10 000. */
  timeoutMs: number;
  /** Retry count per domain on transient failure. Default: 1. */
  retryCount: number;
  /**
   * Max number of domains to check. -1 = unlimited.
   * Set to a small number (e.g. 5) for smoke tests.
   */
  maxDomains: number;
  /** List of gogol IDs to skip during this run. */
  skipGogols: string[];
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

  // registryDbPath
  const registryDbPath = typeof data.registryDbPath === 'string' ? data.registryDbPath.trim() : '';
  if (!registryDbPath) {
    throw new Error('brief.md: registryDbPath must be a non-empty string');
  }

  const concurrency = getFiniteNumber(data.concurrency, 'concurrency') ?? 5;
  const timeoutMs = getFiniteNumber(data.timeoutMs, 'timeoutMs') ?? 10_000;
  const retryCount = getFiniteNumber(data.retryCount, 'retryCount') ?? 1;
  const maxDomains = getFiniteNumber(data.maxDomains, 'maxDomains') ?? -1;

  return {
    sourceToken: parsedToken.raw,
    registryDbPath,
    deviceId: getDeviceId(),
    year: parsedToken.year,
    concurrency,
    timeoutMs,
    retryCount,
    maxDomains,
    skipGogols: getStringArray(data.skipGogols),
  };
};

