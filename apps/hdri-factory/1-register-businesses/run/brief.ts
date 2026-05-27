/*
<MODULE_CONTRACT>
<purpose>Logic for parsing and validating the shared factory-level brief.md configuration.</purpose>
<keywords>brief, configuration, validation, gray-matter</keywords>
<responsibilities>
  <item>Defines the Brief type representing global configuration.</item>
  <item>Parses frontmatter from brief.md using gray-matter.</item>
  <item>Validates required fields (sourceToken, coreDbPath).</item>
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
  <item>Initial implementation.</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>parseBriefMarkdown now accepts optional sharedSourceToken parameter for two-file brief pattern.</item>
  <item>Remove sharedSourceToken parameter; merge now handled centrally by mergeBriefFrontmatter from @org/pipeline-node.</item>
  <item>Add coreDbPath to Brief type and parser so upstream core.db path is configurable in brief.md instead of hardcoded.</item>
</CHANGE_SUMMARY>
*/

import matter from 'gray-matter';
import { parseSourceToken } from '@org/observatory-crypto';

export type Brief = {
  /**
   * Canonical batch identifier in `yyyy-qn-cc[-extra]` format.
   * Sole axis of idempotency.
  */
  sourceToken: string;
  /**
   * Absolute or app-root-relative path to the upstream core.db.
   * Example: "../0-harvest-source/.output/${DEVICE_ID}/data/db/core_2026.db"
   */
  coreDbPath: string;
  /** List of gogol IDs to skip during this run. */
  skipGogols: string[];
};

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  const tokenRaw = typeof data.sourceToken === 'string' ? data.sourceToken.trim() : '';
  if (!tokenRaw) {
    throw new Error('brief.md: sourceToken must be provided in shared factory brief or local brief (e.g. "2026-q2-de")');
  }
  if (!/^[a-z0-9-]+$/.test(tokenRaw)) {
    throw new Error(
      `brief.md: sourceToken must be lowercase kebab-case (a-z, 0-9, hyphens only). Got: "${tokenRaw}"`,
    );
  }
  parseSourceToken(tokenRaw); // validate format

  const coreDbPath = typeof data.coreDbPath === 'string' ? data.coreDbPath.trim() : '';
  if (!coreDbPath) {
    throw new Error('brief.md: coreDbPath must be a non-empty string');
  }

  const skip = Array.isArray(data.skipGogols)
    ? data.skipGogols.filter((x): x is string => typeof x === 'string')
    : [];

  return { sourceToken: tokenRaw, coreDbPath, skipGogols: skip };
};
