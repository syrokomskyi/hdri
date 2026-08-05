/*
<MODULE_CONTRACT>
<purpose>Logic for parsing and validating the app-local brief.md configuration — this module handles brief operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage filesystem I/O directly.</item>
  <item>Do not handle gogol-specific configurations beyond global brief scope.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of brief parsing with validation.</item>
  <item>Add parserConcurrency to Brief type and parser to allow configurable parallel parsing.</item>
  <item>Add zipcodesTablePath field for geographic analysis reports.</item>
  <item>Phase B cleanup: remove deprecated harvestYear, harvestQuarter, batchToken fields.</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>Replace maxSites with maxPages: maxPages limits total source files parsed across all batches (-1 = unlimited).</item>
  <item>Add minSitesThreshold field for empty-quarter fail-fast guard (RFC-0068).</item>
</CHANGE_SUMMARY>
*/

import matter from "gray-matter";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { assertCapsuleId } from "@syrokomskyi/factory-core";

export type Brief = {
  /**
   * Canonical batch identifier in `YYYY-Qn-CC[-extra]` format.
   * Sole axis of idempotency for the factory pipeline (Phase A onwards).
   */
  sourceToken: string;
  /** UUID v7 shared by every stage of this quarter. */
  capsuleId: string;
  /**
   * Path to the zipcodes JSON file for geographic analysis.
   * Relative to app root or absolute path.
   */
  zipcodesTablePath: string | null;
  /** Regex patterns applied to batchScopedPath to skip source files. */
  exclude: string[];
  /** Max total source pages (files) to parse across all batches (-1 = unlimited). */
  maxPages: number;
  /** List of gogol IDs to skip during this run. */
  skipGogols: string[];
  /** Max concurrent files to parse in parallel. */
  parserConcurrency: number;
  /** Minimum total registered sites required before sealing (default: 1). Set to 0 to disable. */
  minSitesThreshold: number;
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const getFiniteNumber = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  throw new Error(`brief.md: ${fieldName} must be a finite number when provided`);
};

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  // sourceToken (canonical)
  const sourceTokenRaw = typeof data.sourceToken === "string" ? data.sourceToken.trim() : "";
  if (!sourceTokenRaw) {
    throw new Error('brief.md: sourceToken must be a non-empty string (e.g. "2026-q2-de")');
  }
  if (!/^[a-z0-9-]+$/.test(sourceTokenRaw)) {
    throw new Error(
      `brief.md: sourceToken must be lowercase kebab-case (a-z, 0-9, hyphens only). Got: "${sourceTokenRaw}"`,
    );
  }
  const parsedToken = parseSourceToken(sourceTokenRaw);

  const capsuleId = typeof data.capsuleId === "string" ? data.capsuleId.trim().toLowerCase() : "";
  assertCapsuleId(capsuleId);

  // zipcodesTablePath
  const zipcodesTablePath =
    typeof data.zipcodesTablePath === "string" ? data.zipcodesTablePath.trim() || null : null;

  // exclude
  const exclude = getStringArray(data.exclude);
  for (const pattern of exclude) {
    try {
      new RegExp(pattern, "u");
    } catch (error) {
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        `brief.md: invalid regex in exclude: ${pattern} (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const maxPages = getFiniteNumber(data.maxPages, "maxPages") ?? -1;

  return {
    sourceToken: parsedToken.raw,
    capsuleId,
    zipcodesTablePath,
    exclude,
    maxPages,
    skipGogols: getStringArray(data.skipGogols),
    parserConcurrency: getFiniteNumber(data.parserConcurrency, "parserConcurrency") ?? 20,
    minSitesThreshold: getFiniteNumber(data.minSitesThreshold, "minSitesThreshold") ?? 1,
  };
};
