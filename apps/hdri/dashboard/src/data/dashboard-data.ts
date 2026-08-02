/*
<MODULE_CONTRACT>
<purpose>Load and parse period-specific and codebook data files</purpose>
<non-goals>
  <item>Does not handle data persistence or storage</item>
  <item>Does not modify or transform the data content</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of data loading functions</item>
</CHANGE_SUMMARY>
*/

import type { PeriodManifest, Overview, DimensionItem, SliceItem, MatrixItem } from "../types";
import { parse as parseYaml } from "yaml";

const manifestModules = import.meta.glob("../assets/data/public/periods/*/manifest.json", {
  eager: true,
});
const overviewModules = import.meta.glob("../assets/data/public/periods/*/overview.json", {
  eager: true,
});
const dimensionModules = import.meta.glob("../assets/data/public/periods/*/dimensions.json", {
  eager: true,
});
const bundeslandModules = import.meta.glob("../assets/data/public/periods/*/bundeslaender.json", {
  eager: true,
});
const gewerkModules = import.meta.glob("../assets/data/public/periods/*/gewerke.json", {
  eager: true,
});
const matrixModules = import.meta.glob("../assets/data/public/periods/*/matrix.json", {
  eager: true,
});

export function readPeriodFile<T>(modules: Record<string, unknown>, period: string): T {
  const entry = Object.entries(modules).find(([filePath]) =>
    filePath.includes(`/periods/${period}/`),
  );
  if (!entry) {
    throw new Error(`Missing dashboard archive file for period ${period}`);
  }
  return (entry[1] as { default: T }).default;
}

export function loadCurrentPeriod(period: string) {
  return {
    manifest: readPeriodFile<PeriodManifest>(manifestModules, period),
    overview: readPeriodFile<Overview>(overviewModules, period),
    dimensions: readPeriodFile<DimensionItem[]>(dimensionModules, period),
    bundeslaender: readPeriodFile<SliceItem[]>(bundeslandModules, period),
    gewerke: readPeriodFile<SliceItem[]>(gewerkModules, period),
    matrix: readPeriodFile<MatrixItem[]>(matrixModules, period),
  };
}

const codebookModules = import.meta.glob("../assets/data/public/codebook-observatory-*.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
});

export function loadCodebook() {
  const entries = Object.entries(codebookModules);
  if (entries.length === 0) {
    throw new Error("No codebook-observatory-*.yaml found in assets/data/public/");
  }
  // Pick the highest version by sorting on the filename.
  const sorted = entries.sort(([a], [b]) => b.localeCompare(a));
  const yamlText = sorted[0][1] as string;
  return parseYaml(yamlText);
}

export type ChangelogChange = {
  field: string;
  from: string | null;
  to: string | null;
};

export type ChangelogEntry = {
  period: string;
  previousPeriod: string | null;
  methodologyHash: string;
  codebookId: string;
  codebookVersion: string;
  ontologyVersion: string;
  scorerVersion: string;
  frozenAt: string;
  status: "baseline" | "unchanged" | "changed";
  comparabilityBreak: boolean;
  changes: ChangelogChange[];
};

export function loadChangelog(): ChangelogEntry[] {
  const changelogModules = import.meta.glob("../assets/data/public/methodology-changelog.json", {
    eager: true,
  });
  const changelogDoc = (Object.values(changelogModules)[0] ?? {}) as {
    default?: { entries?: ChangelogEntry[] };
    entries?: ChangelogEntry[];
  };
  const entries = changelogDoc.default?.entries ?? changelogDoc.entries ?? [];
  return [...entries].reverse();
}
