/*
<MODULE_CONTRACT>
<purpose>Parse brief.md frontmatter into a typed Brief configuration object — this module handles brief operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not perform database access or cohort resolution.</item>
  <item>Do not write files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Make cohortId optional; if omitted it is resolved later from registry.db.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Remove axe prefix from config fields - this app is Axe-only.</item>
  <item>Phase B cleanup: remove deprecated auditYear, auditToken fields.</item>
  <item>Phase B cleanup: remove cohortId, auditSampleSize, randomSeed, fixtureDir (audit all live businesses).</item>
  <item>Enforce lowercase kebab-case validation on sourceToken.</item>
  <item>parseBriefMarkdown now accepts optional sharedSourceToken parameter for two-file brief pattern.</item>
  <item>Remove sharedSourceToken parameter; merge now handled centrally by mergeBriefFrontmatter from @syrokomskyi/pipeline-node.</item>
  <item>RFC-0046: add instrumentPlan field parsed from brief frontmatter.</item>
</CHANGE_SUMMARY>
*/

import matter from "gray-matter";
import { parseSourceToken, getDeviceId } from "@syrokomskyi/observatory-crypto";
import {
  assertCapsuleId,
  parseInstrumentPlanFromFrontmatter,
  type InstrumentPlanEntry,
} from "@syrokomskyi/factory-core";

export type Brief = {
  /**
   * Canonical batch identifier in `yyyy-qn-cc[-extra]` format.
   * Sole axis of idempotency.
   */
  sourceToken: string;
  /** UUID v7 shared by every stage of this quarter. */
  capsuleId: string;
  /**
   * Absolute or app-root-relative path to registry.db (read-only).
   */
  registryDbPath: string;
  /** Device ID extracted from sourceToken. */
  deviceId: string;
  /** Year extracted from sourceToken. */
  year: number;
  // --- Tool config -------------------------------------------------------
  concurrency: number;
  timeoutMs: number;
  retries: number;
  /** Gogol ids to skip during this run. */
  skipGogols: string[];
  /** Sample size limit (-1 = all sites). */
  auditSampleSize: number;
  /** Absolute or app-root-relative path to liveness.db (read-only). */
  livenessDbPath: string;
  /** Instrument plan for this quarter. Defaults to Lighthouse disabled. */
  instrumentPlan: InstrumentPlanEntry[];
};

// ---------------------------------------------------------------------------
// Parser helpers
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

const getRequiredString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`brief.md: ${name} must be a non-empty string`);
  }
  return value.trim();
};

const getOptionalString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// ---------------------------------------------------------------------------

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  const sourceTokenRaw = typeof data.sourceToken === "string" ? data.sourceToken.trim() : "";
  if (!sourceTokenRaw) {
    throw new Error(
      'brief.md: sourceToken must be provided in shared factory brief or local brief (e.g. "2026-q2-de")',
    );
  }
  if (!/^[a-z0-9-]+$/.test(sourceTokenRaw)) {
    throw new Error(
      `brief.md: sourceToken must be lowercase kebab-case (a-z, 0-9, hyphens only). Got: "${sourceTokenRaw}"`,
    );
  }
  const parsedToken = parseSourceToken(sourceTokenRaw);
  const capsuleId = typeof data.capsuleId === "string" ? data.capsuleId.trim().toLowerCase() : "";
  assertCapsuleId(capsuleId);
  void getRequiredString;
  void getOptionalString;

  return {
    sourceToken: parsedToken.raw,
    capsuleId,
    registryDbPath: getRequiredString(data.registryDbPath, "registryDbPath"),
    deviceId: getDeviceId(),
    year: parsedToken.year,
    concurrency: getFiniteNumber(data.concurrency, "concurrency") ?? 2,
    timeoutMs: getFiniteNumber(data.timeoutMs, "timeoutMs") ?? 60_000,
    retries: getFiniteNumber(data.retries, "retries") ?? 2,
    skipGogols: getStringArray(data.skipGogols),
    auditSampleSize: getFiniteNumber(data.auditSampleSize, "auditSampleSize") ?? -1,
    livenessDbPath: getRequiredString(data.livenessDbPath, "livenessDbPath"),
    instrumentPlan: parseInstrumentPlanFromFrontmatter(data.instrumentPlan),
  };
};
