/*
<MODULE_CONTRACT>
<purpose>Load dashboard period data and validate manifest-bound availability JSON/CSV independently of score products.</purpose>
<non-goals>
  <item>Does not handle data persistence or storage</item>
  <item>Does not grant publication admission or consume private Observatory evidence</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of data loading functions</item>
  <item>RFC-0115: load availability releases separately without advancing the score-period pointer.</item>
</CHANGE_SUMMARY>
*/

import type { PeriodManifest, Overview, DimensionItem, SliceItem, MatrixItem } from "../types";
import { parse as parseYaml } from "yaml";
import { readAvailabilityDownload } from "../lib/availability";

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

const availabilityFiles = import.meta.glob("../assets/data/public/availability/*/*.{json,csv}", {
  eager: true, query: "?raw", import: "default",
});

export function loadAvailabilityPeriods() {
  const roots = new Set(Object.keys(availabilityFiles).map(file => file.slice(0, file.lastIndexOf("/"))));
  return [...roots].sort().reverse().map(root => {
    const period = root.slice(root.lastIndexOf("/") + 1);
    const read = (name: string) => {
      const value = availabilityFiles[`${root}/${name}`];
      if (typeof value !== "string") throw new Error(`Missing availability product: ${period}/${name}`);
      return value;
    };
    return readAvailabilityDownload(period, read("public-manifest.json"), read("availability.json"), read("availability.csv"));
  });
}

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

const codebookModules = import.meta.glob("../assets/data/public/codebook.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
});

export function loadCodebook() {
  const entries = Object.entries(codebookModules);
  if (entries.length === 0) {
    throw new Error("No codebook.yaml found in assets/data/public/");
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
