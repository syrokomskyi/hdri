/*
<MODULE_CONTRACT>
<purpose>Filesystem and path helpers for the HDRI dashboard archive exporter.</purpose>
<non-goals>
  <item>Does not query SQLite databases (see archive-export-db.ts).</item>
  <item>Does not compute aggregates or comparisons.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted filesystem helpers and codebook copy from export-dashboard-archive.ts during file-size refactor.</item>
  <item>Handle missing DB_DIR gracefully in findObservatoryDbs — return empty array instead of throwing ENOENT.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { stringify } from "csv-stringify/sync";
import {
  DB_DIR,
  DASHBOARD_PUBLIC_DIR,
  DASHBOARD_DEBUG_DIR,
  DASHBOARD_DEBUG_PUBLIC_DIR,
  DASHBOARD_STATIC_PUBLIC_DIR,
} from "./archive-export-types";
import type { DebugSiteRow, PeriodSnapshot, PublishedRunRow } from "./archive-export-types";

export async function findObservatoryDbs(): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(DB_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^observatory_\d{4}\.db$/i.test(entry.name))
    .map((entry) => path.join(DB_DIR, entry.name))
    .sort();
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function ensureUniquePeriods(snapshots: PeriodSnapshot[]): void {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.manifest.period)) {
      throw new Error(
        `Multiple published runs found for period ${snapshot.manifest.period}; archive export requires exactly one canonical run per period`,
      );
    }
    seen.add(snapshot.manifest.period);
  }
}

export async function writePeriodSnapshot(snapshot: PeriodSnapshot): Promise<void> {
  console.log(`  · Writing public snapshot for ${snapshot.manifest.period}`);
  const periodDir = path.join(DASHBOARD_PUBLIC_DIR, "periods", snapshot.manifest.period);
  await fs.mkdir(periodDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(periodDir, "manifest.json"), snapshot.manifest),
    writeJson(path.join(periodDir, "overview.json"), snapshot.overview),
    writeJson(path.join(periodDir, "dimensions.json"), snapshot.dimensions),
    writeJson(path.join(periodDir, "bundeslaender.json"), snapshot.bundeslaender),
    writeJson(path.join(periodDir, "gewerke.json"), snapshot.gewerke),
    writeJson(path.join(periodDir, "matrix.json"), snapshot.matrix),
  ]);
}

export async function writeCodebookYaml(): Promise<void> {
  const codebookPath = path.resolve(process.cwd(), ".input", "codebook.yaml");
  const yamlText = await fs.readFile(codebookPath, "utf-8");

  const versionMatch = yamlText.match(/^version:\s*"([^"]+)"/m);
  const version = versionMatch ? versionMatch[1] : "v1.0.0";
  const filename = `codebook-observatory-${version}.yaml`;

  const buildDestination = path.join(DASHBOARD_PUBLIC_DIR, filename);
  await fs.writeFile(buildDestination, yamlText, "utf-8");

  await fs.mkdir(DASHBOARD_STATIC_PUBLIC_DIR, { recursive: true });
  const staticDestination = path.join(DASHBOARD_STATIC_PUBLIC_DIR, filename);
  await fs.writeFile(staticDestination, yamlText, "utf-8");
}

/**
 * Generates per-period debug artifacts straight from the DB for one run:
 *   .debug/<period>/<run>/site-scores.csv         (internal — includes domain)
 *   .debug/<period>/<run>/cohort-aggregates.json
 *   .debug-public/<period>/<run>/site-scores.csv  (public-safe — no domain)
 *   .debug-public/<period>/<run>/cohort-aggregates.json
 *
 * These are git-ignored, local-only inspection aids. Unlike the old approach
 * (copying the single .output/mart, which only ever held the most recent run
 * and thus mislabeled every other period), this is correct per period.
 */
export async function writePeriodDebugFromDb(
  db: Database.Database,
  run: PublishedRunRow,
): Promise<void> {
  console.log(`  · Writing per-period debug for ${run.period}`);
  const internalDir = path.join(DASHBOARD_DEBUG_DIR, run.period, run.run_id);
  const publicDir = path.join(DASHBOARD_DEBUG_PUBLIC_DIR, run.period, run.run_id);
  await fs.mkdir(internalDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  const siteRows = db
    .prepare(
      `SELECT s.asset_id, a.domain, m.target_code AS destatis_group, m.target_label AS destatis_label,
              a.bundesland, s.overall_score, s.confidence, s.codebook_version
       FROM scores s
       JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
       LEFT JOIN asset_hwo_mappings m
         ON m.asset_id = s.asset_id AND m.mapping_system = 'destatis_group' AND m.run_id = s.run_id
       WHERE s.run_id = ?
       ORDER BY s.overall_score DESC`,
    )
    .all(run.run_id) as DebugSiteRow[];

  const internalColumns = [
    "asset_id",
    "domain",
    "destatis_group",
    "destatis_label",
    "bundesland",
    "overall_score",
    "confidence",
    "codebook_version",
  ];
  const publicColumns = internalColumns.filter((c) => c !== "domain");

  await fs.writeFile(
    path.join(internalDir, "site-scores.csv"),
    stringify(siteRows, { header: true, columns: internalColumns }),
    "utf-8",
  );
  await fs.writeFile(
    path.join(publicDir, "site-scores.csv"),
    stringify(siteRows, { header: true, columns: publicColumns }),
    "utf-8",
  );

  const aggRows = db
    .prepare(
      `SELECT axis, axis_value, stat_type, dimension_id, n, mean, p10, p25, p50, p75, p90, min_val, max_val
       FROM cohort_aggregates
       WHERE cohort_id IN (SELECT id FROM cohorts WHERE run_id = ?)`,
    )
    .all(run.run_id);
  const aggJson = JSON.stringify(aggRows, null, 2);
  await fs.writeFile(path.join(internalDir, "cohort-aggregates.json"), aggJson, "utf-8");
  await fs.writeFile(path.join(publicDir, "cohort-aggregates.json"), aggJson, "utf-8");
}
