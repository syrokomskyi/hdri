/*
<MODULE_CONTRACT>
<purpose>Orchestrates the export of public quarterly HDRI archives and comparison datasets for the dashboard Astro app.</purpose>
<non-goals>
  <item>Does not contain SQL queries, aggregation math, or comparison logic directly.</item>
  <item>Does not publish domain names, asset IDs, or per-site remediation details.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial archive exporter for quarterly public HDRI snapshots and comparisons.</item>
  <item>Add stable comparison categories, explicit comparison manifests, and richer suppression reasons for public trend datasets.</item>
  <item>Add minimal console progress indicators at key milestones to track export without overloading output.</item>
  <item>Add .debug-public folder creation with domain column/field removed from CSV and JSON files.</item>
  <item>Add stdDev to ScoreSummary (sample standard deviation) for richer distribution context.</item>
  <item>Add Reliability type and computeReliability function to ComparisonPoint for delta trust indicators.</item>
  <item>Parallelize DB reads and period writes; simplify previousPeriod resolution; stream-process CSV in writeDebugPublicCopies to cut memory and CPU.</item>
  <item>Export operational codebook YAML as JSON into dashboard public assets for transparency and reproducibility.</item>
  <item>Add granular console progress logging throughout buildSnapshot, writePeriodSnapshot, writeDebugCopies, writeDebugPublicCopies, and buildNamedComparisons so long exports do not appear frozen.</item>
  <item>Restore missing archive.json write that was lost during exporter refactoring; index.astro depends on it.</item>
  <item>Copy raw codebook YAML into dashboard public assets instead of serializing to JSON; dashboard now parses YAML directly at build time.</item>
  <item>WP3: cross-quarter comparability guards — hard-suppress deltas when codebook/ontology versions differ between periods; flag sample-frame shifts (|ΔN|/N) as caution without hiding the value; build the matrix comparison universe from the full k-anon set (not the top-48 display slice); read the authoritative scoring codebook version from scores instead of the run-level metadata.</item>
  <item>Add secondary sort keys (id for bundeslaender, bundesland for matrix) to stabilize output order when p75 ties.</item>
  <item>File-size refactor: extracted types, DB helpers, snapshot builders, comparison builders, and I/O helpers into sibling modules; this file is now a thin orchestrator.</item>
  <item>Load k-anon policy from policies/k-anon-policy-v{N}.yaml; pass effective_k_min to all snapshot and comparison builders.</item>
  <item>Skip export gracefully when no observatory DBs found instead of throwing, so monorepo build succeeds without runtime data.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import type { ComparisonPoint } from "./comparison-core";
import { buildPanelTrends } from "./panel-core";
import { loadKAnonPolicy } from "./k-anon-policy";
import {
  collectPublishedRuns,
  collectPeriodAssetScores,
  writePostStratTrends,
  writeMethodologyChangelog,
} from "./archive-export-db";
import { buildSnapshot } from "./archive-export-snapshot";
import {
  buildOverviewTrends,
  buildNamedComparisons,
  buildComparisonManifest,
} from "./archive-export-comparison";
import {
  findObservatoryDbs,
  writeJson,
  writePeriodSnapshot,
  writePeriodDebugFromDb,
  writeCodebookYaml,
  ensureUniquePeriods,
} from "./archive-export-io";
import {
  DASHBOARD_PUBLIC_DIR,
  DASHBOARD_DEBUG_DIR,
  DASHBOARD_DEBUG_PUBLIC_DIR,
  type PeriodSnapshot,
} from "./archive-export-types";

const log = createJsonLogger({ app: "observatory", pipeline: "dashboard-archive-export" });

async function main(): Promise<void> {
  console.log("📊 HDRI Dashboard Archive Export");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const policy = await loadKAnonPolicy();
  const kAnonymityMin = policy.effective_k_min;
  console.log(
    `✓ K-anon policy v${policy.version}: default_k=${policy.default_k}, hard_floor=${policy.hard_floor}, effective_k_min=${kAnonymityMin}`,
  );

  const dbPaths = await findObservatoryDbs();
  if (dbPaths.length === 0) {
    console.log("ℹ No observatory DB files found in .output/db; skipping dashboard archive export");
    return;
  }
  console.log(`✓ Found ${dbPaths.length} observatory database(s)`);

  await fs.rm(DASHBOARD_PUBLIC_DIR, { recursive: true, force: true });
  await fs.mkdir(DASHBOARD_PUBLIC_DIR, { recursive: true });
  await fs.mkdir(DASHBOARD_DEBUG_DIR, { recursive: true });
  await fs.mkdir(DASHBOARD_DEBUG_PUBLIC_DIR, { recursive: true });

  const snapshotGroups = await Promise.all(
    dbPaths.map(async (dbPath) => {
      const db = new Database(dbPath, { readonly: true });
      try {
        const publishedRuns = collectPublishedRuns(db);
        console.log(`  → DB ${path.basename(dbPath)}: ${publishedRuns.length} published run(s)`);
        const snaps = publishedRuns.map((run) => buildSnapshot(db, dbPath, run, kAnonymityMin));
        for (const run of publishedRuns) {
          await writePeriodDebugFromDb(db, run);
        }
        return snaps;
      } finally {
        db.close();
      }
    }),
  );
  const snapshots = snapshotGroups.flat();

  snapshots.sort((left, right) => left.manifest.period.localeCompare(right.manifest.period));
  ensureUniquePeriods(snapshots);
  if (snapshots.length === 0) {
    throw new Error("No canonical published runs found; cannot export dashboard archive");
  }
  console.log(`✓ Loaded ${snapshots.length} published period(s)`);

  await Promise.all(snapshots.map((snapshot) => writePeriodSnapshot(snapshot)));
  console.log(`✓ Wrote ${snapshots.length} period snapshot(s)`);

  const comparisonsDir = path.join(DASHBOARD_PUBLIC_DIR, "comparisons");
  await fs.mkdir(comparisonsDir, { recursive: true });
  const overviewTrendData = buildOverviewTrends(snapshots, kAnonymityMin);
  console.log(`  ✓ Built overview trends: ${overviewTrendData.length} point(s)`);
  const dimensionTrendData = buildNamedComparisons(snapshots, "dimension", kAnonymityMin);
  const bundeslandTrendData = buildNamedComparisons(snapshots, "bundesland", kAnonymityMin);
  const gewerkTrendData = buildNamedComparisons(snapshots, "gewerk", kAnonymityMin);
  const matrixTrendData = buildNamedComparisons(snapshots, "matrix", kAnonymityMin);
  console.log(`  ✓ All comparisons built`);

  await writePublicComparisons(
    comparisonsDir,
    snapshots,
    overviewTrendData,
    dimensionTrendData,
    bundeslandTrendData,
    gewerkTrendData,
    matrixTrendData,
    kAnonymityMin,
  );

  const latest = snapshots[snapshots.length - 1]!;
  const periodScores = collectPeriodAssetScores(dbPaths);
  const panelTrendData = buildPanelTrends(periodScores, kAnonymityMin);
  await writeJson(path.join(comparisonsDir, "panel-trends.json"), panelTrendData);
  console.log(`  ✓ Built panel (like-for-like) trends: ${panelTrendData.length} pair(s)`);

  await writePostStratTrends(comparisonsDir, dbPaths);
  await writeMethodologyChangelog(dbPaths);
  await writeCodebookYaml();
  console.log(`✓ Exported codebook as YAML`);

  console.log(
    `✓ Export complete: ${snapshots.length} period(s), latest: ${latest.manifest.period}`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  log.info(
    "archive-exported",
    `Exported ${snapshots.length} published period(s) to ${DASHBOARD_PUBLIC_DIR}`,
    {
      periodCount: snapshots.length,
      latestPeriod: latest.manifest.period,
    },
  );
}

async function writePublicComparisons(
  comparisonsDir: string,
  snapshots: PeriodSnapshot[],
  overviewTrendData: ComparisonPoint[],
  dimensionTrendData: ComparisonPoint[],
  bundeslandTrendData: ComparisonPoint[],
  gewerkTrendData: ComparisonPoint[],
  matrixTrendData: ComparisonPoint[],
  kAnonymityMin: number,
): Promise<void> {
  await writeJson(
    path.join(DASHBOARD_PUBLIC_DIR, "archive.json"),
    snapshots.map((snapshot) => ({
      period: snapshot.manifest.period,
      manifestPath: `periods/${snapshot.manifest.period}/manifest.json`,
      overviewPath: `periods/${snapshot.manifest.period}/overview.json`,
    })),
  );
  const latest = snapshots[snapshots.length - 1]!;
  await writeJson(path.join(DASHBOARD_PUBLIC_DIR, "latest.json"), {
    period: latest.manifest.period,
    manifestPath: `periods/${latest.manifest.period}/manifest.json`,
  });

  await writeJson(path.join(comparisonsDir, "overview-trends.json"), overviewTrendData);
  await writeJson(
    path.join(comparisonsDir, "overview-manifest.json"),
    buildComparisonManifest(snapshots, "overall", overviewTrendData, kAnonymityMin),
  );
  await writeJson(path.join(comparisonsDir, "dimension-trends.json"), dimensionTrendData);
  await writeJson(
    path.join(comparisonsDir, "dimension-manifest.json"),
    buildComparisonManifest(snapshots, "dimension", dimensionTrendData, kAnonymityMin),
  );
  await writeJson(path.join(comparisonsDir, "bundesland-trends.json"), bundeslandTrendData);
  await writeJson(
    path.join(comparisonsDir, "bundesland-manifest.json"),
    buildComparisonManifest(snapshots, "bundesland", bundeslandTrendData, kAnonymityMin),
  );
  await writeJson(path.join(comparisonsDir, "gewerk-trends.json"), gewerkTrendData);
  await writeJson(
    path.join(comparisonsDir, "gewerk-manifest.json"),
    buildComparisonManifest(snapshots, "gewerk", gewerkTrendData, kAnonymityMin),
  );
  await writeJson(path.join(comparisonsDir, "matrix-trends.json"), matrixTrendData);
  await writeJson(
    path.join(comparisonsDir, "matrix-manifest.json"),
    buildComparisonManifest(snapshots, "matrix", matrixTrendData, kAnonymityMin),
  );
  console.log(`✓ Built comparison datasets`);
}

void main().catch((error: unknown) => {
  log.error("failed", "[export-dashboard-archive] Failed:", { error: String(error) });
  process.exitCode = 1;
});
