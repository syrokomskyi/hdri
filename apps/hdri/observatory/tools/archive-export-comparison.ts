/*
<MODULE_CONTRACT>
<purpose>Cross-period comparison builders for the HDRI dashboard archive exporter — this module handles archive-export-comparison operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not read databases or write files directly (returns in-memory data).</item>
  <item>Does not compute per-period snapshot aggregates.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted cross-period comparison builders from export-dashboard-archive.ts during file-size refactor.</item>
  <item>Pass kAnonymityMin through to createComparisonPoint; replace SUPPRESSION_POLICY with createSuppressionPolicy.</item>
</CHANGE_SUMMARY>
*/

import { createComparisonPoint, versionMismatchReasons } from "./comparison-core";
import type { ComparisonPoint, ScoreSummary, ComparisonAxis } from "./comparison-core";
import {
  createSuppressionPolicy,
  type PeriodSnapshot,
  type ComparisonManifest,
} from "./archive-export-types";
import type { ComparisonCategoryManifest } from "./archive-export-types";

export function buildOverviewTrends(
  snapshots: PeriodSnapshot[],
  kAnonymityMin: number,
): ComparisonPoint[] {
  return snapshots.map((snapshot, index) => {
    const previous = index > 0 ? snapshots[index - 1]! : null;
    const currentSummary = snapshot.overview.summary;
    const previousSummary = previous?.overview.summary ?? null;
    return createComparisonPoint({
      axis: "overall",
      period: snapshot.manifest.period,
      previousPeriod: previous?.manifest.period ?? null,
      label: "HDRI Gesamt",
      key: "overall",
      current: currentSummary,
      previous: previousSummary,
      currentPresent: true,
      previousPresent: previousSummary !== null,
      versionMismatch: versionMismatchReasons(previous?.manifest ?? null, snapshot.manifest),
      kAnonymityMin,
    });
  });
}

export function buildNamedComparisons(
  snapshots: PeriodSnapshot[],
  axis: "dimension" | "bundesland" | "gewerk" | "matrix",
  kAnonymityMin: number,
): ComparisonPoint[] {
  console.log(`  · Building ${axis} comparisons across ${snapshots.length} period(s)`);
  const rows: ComparisonPoint[] = [];
  const universe = buildAxisUniverse(snapshots, axis);
  let previousMap = new Map<string, { label: string; summary: ScoreSummary }>();

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i]!;
    const prevSnapshot = i > 0 ? snapshots[i - 1]! : null;
    const versionMismatch = versionMismatchReasons(
      prevSnapshot?.manifest ?? null,
      snapshot.manifest,
    );
    const currentEntries = getAxisEntries(snapshot, axis);
    const currentMap = new Map<string, { label: string; summary: ScoreSummary }>();
    for (const entry of currentEntries) {
      currentMap.set(entry.key, { label: entry.label, summary: entry.summary });
    }

    for (const category of universe) {
      const current = currentMap.get(category.key) ?? null;
      const previous = previousMap.get(category.key) ?? null;
      rows.push(
        createComparisonPoint({
          axis,
          period: snapshot.manifest.period,
          previousPeriod: previousMap.size > 0 && i > 0 ? snapshots[i - 1]!.manifest.period : null,
          label: current?.label ?? previous?.label ?? category.label,
          key: category.key,
          current: current?.summary ?? null,
          previous: previous?.summary ?? null,
          currentPresent: current !== null,
          previousPresent: previous !== null,
          versionMismatch,
          kAnonymityMin,
        }),
      );
    }

    previousMap = currentMap;
  }

  return rows;
}

export function buildAxisUniverse(
  snapshots: PeriodSnapshot[],
  axis: "dimension" | "bundesland" | "gewerk" | "matrix",
): Array<{ key: string; label: string }> {
  const universe = new Map<string, string>();
  for (const snapshot of snapshots) {
    for (const entry of getAxisEntries(snapshot, axis)) {
      if (!universe.has(entry.key)) {
        universe.set(entry.key, entry.label);
      }
    }
  }
  return [...universe.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildComparisonManifest(
  snapshots: PeriodSnapshot[],
  axis: ComparisonAxis,
  rows: ComparisonPoint[],
  kAnonymityMin: number,
): ComparisonManifest {
  const periodSet = snapshots.map((snapshot) => snapshot.manifest.period);
  const categoryMap = new Map<string, ComparisonCategoryManifest>();
  for (const row of rows) {
    if (row.currentStatus === "absent") {
      continue;
    }
    const existing = categoryMap.get(row.key);
    if (existing) {
      existing.lastPeriod = row.period;
      if (!existing.periodsPresent.includes(row.period)) {
        existing.periodsPresent.push(row.period);
      }
    } else {
      categoryMap.set(row.key, {
        key: row.key,
        label: row.label,
        firstPeriod: row.period,
        lastPeriod: row.period,
        periodsPresent: [row.period],
      });
    }
  }

  return {
    axis,
    generatedAt: new Date().toISOString(),
    suppressionPolicy: createSuppressionPolicy(kAnonymityMin),
    periods: periodSet,
    categories: [...categoryMap.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    ),
  };
}

export function getAxisEntries(
  snapshot: PeriodSnapshot,
  axis: "dimension" | "bundesland" | "gewerk" | "matrix",
): Array<{ key: string; label: string; summary: ScoreSummary }> {
  switch (axis) {
    case "dimension":
      return snapshot.dimensions.map((item) => ({
        key: item.id,
        label: item.label,
        summary: item,
      }));
    case "bundesland":
      return snapshot.bundeslaender.map((item) => ({
        key: item.id,
        label: item.label,
        summary: item,
      }));
    case "gewerk":
      return snapshot.gewerke.map((item) => ({ key: item.id, label: item.label, summary: item }));
    case "matrix":
      return snapshot.matrixFull.map((item) => ({
        key: `${item.bundesland}__${item.gewerk}`,
        label: `${item.bundesland} × ${item.gewerk}`,
        summary: {
          n: item.n,
          mean: item.mean,
          p10: item.p10,
          p25: item.p25,
          p50: item.p50,
          p75: item.p75,
          p90: item.p90,
          min: item.p25,
          max: item.p75,
          stdDev: 0,
        },
      }));
  }
}
