/*
<MODULE_CONTRACT>
<purpose>Parse brief.md frontmatter into a typed Brief configuration object.</purpose>
<keywords>brief, config, yaml-frontmatter, validation</keywords>
<responsibilities>
  <item>Parse and validate audit pipeline configuration from brief.md.</item>
  <item>Enforce required fields and type constraints.</item>
</responsibilities>
<non-goals>
  <item>Do not perform database access or cohort resolution.</item>
  <item>Do not write files.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Brief">Type definition for the parsed brief configuration.</entry>
  <entry key="parseBriefMarkdown">Main parser: gray-matter → Brief object with validation.</entry>
  <entry key="getRequiredString">Validator for mandatory string fields.</entry>
  <entry key="getOptionalString">Validator for optional string fields (empty → '').</entry>
  <entry key="getFiniteNumber">Validator for numeric fields.</entry>
  <entry key="getStringArray">Validator for string-array fields.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Make cohortId optional; if omitted it is resolved later from registry.db.</item>
  <item>Add GRACE scaffolding.</item>
  <item>Add lighthouseFormFactor field to Brief type with validation (desktop/mobile only).</item>
  <item>Remove axe configuration fields - this app is Lighthouse-only.</item>
  <item>Phase B cleanup: remove deprecated auditYear, auditToken fields.</item>
  <item>Phase B cleanup: remove cohortId, auditSampleSize, randomSeed, fixtureDir (audit all live businesses).</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>parseBriefMarkdown now accepts optional sharedSourceToken parameter for two-file brief pattern.</item>
  <item>Remove sharedSourceToken parameter; merge now handled centrally by mergeBriefFrontmatter from @org/pipeline-node.</item>
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
   * Absolute or app-root-relative path to registry.db (read-only).
   */
  registryDbPath: string;
  /** Device ID extracted from sourceToken. */
  deviceId: string;
  /** Year extracted from sourceToken. */
  year: number;
  // --- Tool config -----------------------------------------------------------
  /** Parallel runs. Default 1 — Chrome is memory-hungry. */
  concurrency: number;
  /** Per-run timeout, ms. */
  timeoutMs: number;
  /** Retries on transient failures. */
  retries: number;
  /** Form factor: 'desktop' or 'mobile'. Required. */
  formFactor: 'desktop' | 'mobile';
  /** Gogol ids to skip during this run. */
  skipGogols: string[];
  /** Sample size limit (-1 = all sites). */
  auditSampleSize: number;
  /** Absolute or app-root-relative path to liveness.db (read-only). */
  livenessDbPath: string;
};

// ---------------------------------------------------------------------------
// Parser helpers
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

const getRequiredString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`brief.md: ${name} must be a non-empty string`);
  }
  return value.trim();
};

const getOptionalString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const getFormFactor = (value: unknown): 'desktop' | 'mobile' => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('brief.md: lighthouseFormFactor must be a non-empty string');
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed !== 'desktop' && trimmed !== 'mobile') {
    throw new Error('brief.md: lighthouseFormFactor must be either "desktop" or "mobile"');
  }
  return trimmed as 'desktop' | 'mobile';
};

// ---------------------------------------------------------------------------

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
  void getRequiredString;
  void getOptionalString;

  return {
    sourceToken: parsedToken.raw,
    registryDbPath: getRequiredString(data.registryDbPath, 'registryDbPath'),
    deviceId: getDeviceId(),
    year: parsedToken.year,
    concurrency: getFiniteNumber(data.concurrency, 'concurrency') ?? 1,
    timeoutMs:   getFiniteNumber(data.timeoutMs, 'timeoutMs') ?? 120_000,
    retries:     getFiniteNumber(data.retries, 'retries') ?? 2,
    formFactor:  getFormFactor(data.formFactor),
    skipGogols: getStringArray(data.skipGogols),
    auditSampleSize: getFiniteNumber(data.auditSampleSize, 'auditSampleSize') ?? -1,
    livenessDbPath: getRequiredString(data.livenessDbPath, 'livenessDbPath'),
  };
};