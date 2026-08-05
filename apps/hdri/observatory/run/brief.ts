/*
<MODULE_CONTRACT>
<purpose>Parses the observatory brief.md into a typed Brief object for pipeline configuration.</purpose>
<non-goals>
  <item>Do not handle file I/O — that is done by bootstrap-brief.</item>
  <item>Do not validate source data paths — that is done by gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation of brief parser for observatory.</item>
  <item>Normalize period to lowercase — lowercase yyyy-qn is canonical across factory and observatory.</item>
  <item>Use one capsule-addressed Factory discovery path and remove all legacy fallbacks.</item>
  <item>Rename codebookVersion → codebookId; reject deprecated codebookVersion field instead of silently accepting it.</item>
</CHANGE_SUMMARY>
*/

import matter from "gray-matter";

export type Brief = {
  outputLanguage: string;
  period: string;
  ontologyVersion: string;
  /** Codebook identifier (e.g. "observatory-v1") — NOT the scoring version. */
  codebookId: string;
  /** UUID v7 of the exact Factory capsule consumed by this Observatory run. */
  capsuleId: string;
  /** Root directory of the a-contract-ontology workspace. */
  factoryContractRootDir: string;
  /** Absolute path to the vault directory (accumulates Parquet shards across runs) */
  vaultDir: string;
  publicMode: boolean;
  skipGogols: string[];
};

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value.trim() : undefined;

const getBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

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

  const outputLanguage = getString(data.outputLanguage) ?? getString(data.language);
  if (!outputLanguage) {
    throw new Error("brief.md: missing required field: outputLanguage");
  }

  const periodRaw = getString(data.period);
  if (!periodRaw) {
    throw new Error('brief.md: missing required field: period (e.g. "2025-q2")');
  }
  const period = periodRaw.toLowerCase();

  const ontologyVersion = getString(data.ontologyVersion) ?? "1.0.0";
  const codebookId = getString(data.codebookId);
  if (!codebookId) {
    if (data.codebookVersion !== undefined) {
      throw new Error(
        "brief.md: codebookVersion is deprecated — rename to codebookId (holds the codebook id, not the scoring version)",
      );
    }
    throw new Error('brief.md: missing required field: codebookId (e.g. "observatory-v1")');
  }
  const capsuleId = getString(data.capsuleId);
  if (
    !capsuleId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capsuleId)
  ) {
    throw new Error("brief.md: capsuleId must be a UUID v7");
  }
  const factoryContractRootDir = getString(data.factoryContractRootDir);
  if (!factoryContractRootDir) {
    throw new Error("brief.md: missing required field: factoryContractRootDir");
  }
  const vaultDir = getString(data.vaultDir) ?? "";
  const publicMode = getBoolean(data.publicMode, false);

  return {
    outputLanguage,
    period,
    ontologyVersion,
    codebookId,
    capsuleId,
    factoryContractRootDir,
    vaultDir,
    publicMode,
    skipGogols: getStringArray(data.skipGogols),
  };
};
