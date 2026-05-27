/*
<MODULE_CONTRACT>
<purpose>Parse and validate the a-contract-ontology brief.md configuration.</purpose>
<keywords>brief, configuration, period, ontology</keywords>
<responsibilities>
  <item>Defines the Brief type representing contract-ontology configuration.</item>
  <item>Parses frontmatter from brief.md using gray-matter.</item>
  <item>Validates required period in YYYY-qn format and normalizes to lowercase.</item>
</responsibilities>
<non-goals>
  <item>Do not manage filesystem I/O directly.</item>
  <item>Do not handle pipeline orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Brief">Type definition for the contract-ontology brief.</entry>
  <entry key="parseBriefMarkdown">Main function for transforming raw markdown into a validated Brief object.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Add optional sourceToken field to Brief type for two-file brief pattern.</item>
  <item>Make period regex case-insensitive to accept lowercase 'q' in YYYY-qn format.</item>
  <item>Normalize period to lowercase after validation — lowercase is the canonical format.</item>
  <item>Add upstream DB path fields (harvestDbPath, registryDbPath, livenessDbPath, profileDbPath, lighthouseDbPath, axeDbPath) to Brief type and parser.</item>
</CHANGE_SUMMARY>
*/

import matter from 'gray-matter';
import { parseSourceToken } from '@org/observatory-crypto';

export type Brief = {
  /** Period in `yyyy-qn` format (lowercase q). Hard quarterly boundary for the contract bundle. */
  period: string;
  /** Semver of the ontology used to validate observations. */
  ontologyVersion: string;
  /** Canonical batch identifier from shared factory brief (optional, for logging). */
  sourceToken: string;
  /** Absolute or relative path to upstream core_YYYY.db (harvest). */
  harvestDbPath: string;
  /** Absolute or relative path to upstream registry_YYYY.db. */
  registryDbPath: string;
  /** Absolute or relative path to upstream liveness_YYYY.db. */
  livenessDbPath: string;
  /** Absolute or relative path to upstream pages_*.db (profile). */
  profileDbPath: string;
  /** Absolute or relative path to upstream lighthouse_YYYY.db. */
  lighthouseDbPath: string;
  /** Absolute or relative path to upstream axe_YYYY.db. */
  axeDbPath: string;
  skipGogols: string[];
};

const PERIOD_RE = /^(\d{4})-Q([1-4])$/i;

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  const periodRaw = typeof data.period === 'string' ? data.period.trim() : '';
  if (!periodRaw || !PERIOD_RE.test(periodRaw)) {
    throw new Error('brief.md: period must be in YYYY-qn format (e.g. "2026-q2")');
  }
  const period = periodRaw.toLowerCase();

  const ontologyVersion = typeof data.ontologyVersion === 'string'
    ? data.ontologyVersion.trim() || '1.0.0'
    : '1.0.0';

  const sourceTokenRaw = typeof data.sourceToken === 'string' ? data.sourceToken.trim() : '';
  if (sourceTokenRaw) {
    parseSourceToken(sourceTokenRaw); // validate format
  }

  const skipGogols = Array.isArray(data.skipGogols)
    ? data.skipGogols.filter((x): x is string => typeof x === 'string')
    : [];

  const getRequiredString = (value: unknown, name: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`brief.md: ${name} must be a non-empty string`);
    }
    return value.trim();
  };

  return {
    period,
    ontologyVersion,
    sourceToken: sourceTokenRaw,
    harvestDbPath: getRequiredString(data.harvestDbPath, 'harvestDbPath'),
    registryDbPath: getRequiredString(data.registryDbPath, 'registryDbPath'),
    livenessDbPath: getRequiredString(data.livenessDbPath, 'livenessDbPath'),
    profileDbPath: getRequiredString(data.profileDbPath, 'profileDbPath'),
    lighthouseDbPath: getRequiredString(data.lighthouseDbPath, 'lighthouseDbPath'),
    axeDbPath: getRequiredString(data.axeDbPath, 'axeDbPath'),
    skipGogols,
  };
};
