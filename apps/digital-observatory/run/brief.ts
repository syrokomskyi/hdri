/*
<MODULE_CONTRACT>
<purpose>Parses the observatory brief.md into a typed Brief object for pipeline configuration.</purpose>
<keywords>brief, parsing, configuration</keywords>
<responsibilities>
  <item>Extracts observatory-specific fields from brief.md frontmatter.</item>
  <item>Validates required fields: outputLanguage, period, ontologyVersion, codebookVersion.</item>
  <item>Supports skipGogols for selective execution.</item>
</responsibilities>
<non-goals>
  <item>Do not handle file I/O — that is done by bootstrap-brief.</item>
  <item>Do not validate source data paths — that is done by gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Brief">Typed brief configuration for the observatory pipeline.</entry>
  <entry key="parseBriefMarkdown">Parses brief.md content into Brief.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation of brief parser for digital-observatory.</item>
  <item>Normalize period to lowercase — lowercase yyyy-qn is canonical across factory and observatory.</item>
  <item>P0.4: add factoryContractRootDir for auto-discovery of emit bundle path.</item>
</CHANGE_SUMMARY>
*/

import matter from 'gray-matter';

export type Brief = {
  outputLanguage: string;
  period: string;
  ontologyVersion: string;
  codebookVersion: string;
  /** @deprecated Use factoryContractDir — reads factory SQLite directly */
  sourceDbDir: string;
  /**
   * @deprecated Use factoryContractDir. Kept for Phase A back-compat while
   * SyncFromFactoryGogol is migrated to read a single contract bundle.
   */
  factoryEmitDirs: string[];
  /**
   * Path to a-contract-ontology's per-period emit directory, e.g.
   * `<repo>/apps/hdri-factory/a-contract-ontology/.output/<DEVICE_ID>/emit/<period>/`.
   *
   * Empty string falls back to `factoryEmitDirs` for Phase A back-compat.
   */
  factoryContractDir: string;
  /**
   * Root directory of the factory workspace (e.g. `apps/hdri-factory/a-contract-ontology`).
   * When set and `factoryContractDir` is empty, SyncFromFactory auto-discovers
   * `.output/<DEVICE_ID>/emit/<period>/` for the current brief period.
   */
  factoryContractRootDir: string;
  /** Absolute path to the vault directory (accumulates Parquet shards across runs) */
  vaultDir: string;
  publicMode: boolean;
  skipGogols: string[];
};

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : undefined;

const getBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

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

  const outputLanguage = getString(data.outputLanguage) ?? getString(data.language);
  if (!outputLanguage) {
    throw new Error('brief.md: missing required field: outputLanguage');
  }

  const periodRaw = getString(data.period);
  if (!periodRaw) {
    throw new Error('brief.md: missing required field: period (e.g. "2025-q2")');
  }
  const period = periodRaw.toLowerCase();

  const ontologyVersion = getString(data.ontologyVersion) ?? '1.0.0';
  const codebookVersion = getString(data.codebookVersion) ?? 'hdri-v1.0.0';
  const sourceDbDir = getString(data.sourceDbDir) ?? '';
  const factoryEmitDirs = getStringArray(data.factoryEmitDirs);
  const factoryContractDir = getString(data.factoryContractDir) ?? '';
  const factoryContractRootDir = getString(data.factoryContractRootDir) ?? '';
  const vaultDir = getString(data.vaultDir) ?? '';
  const publicMode = getBoolean(data.publicMode, false);

  return {
    outputLanguage,
    period,
    ontologyVersion,
    codebookVersion,
    sourceDbDir,
    factoryEmitDirs,
    factoryContractDir,
    factoryContractRootDir,
    vaultDir,
    publicMode,
    skipGogols: getStringArray(data.skipGogols),
  };
};
