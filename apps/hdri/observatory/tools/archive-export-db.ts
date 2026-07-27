/*
<MODULE_CONTRACT>
<purpose>SQLite database readers and DB-backed writers for the HDRI dashboard archive exporter.</purpose>
<non-goals>
  <item>Does not compute public snapshots or comparisons (see archive-export-snapshot.ts and archive-export-comparison.ts).</item>
  <item>Does not write codebook files or period payloads (see archive-export-io.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted database query helpers and DB-backed writers from export-dashboard-archive.ts during file-size refactor.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import Database from "better-sqlite3";
import type { PeriodScores } from "./panel-core";
import { buildPostStratTrends, loadPopulationFrame } from "./poststrat-core";
import { buildChangelog, type MethodologyRecord } from "./methodology-changelog-core";
import { DASHBOARD_PUBLIC_DIR } from "./archive-export-types";
import { writeJson } from "./archive-export-io";
import type { PublishedRunRow } from "./archive-export-types";

export function collectPublishedRuns(db: Database.Database): PublishedRunRow[] {
  return db
    .prepare(
      `
    SELECT run_id, period, codebook_version, ontology_version, finished_at, published_at, factory_run_id, bundle_hash
    FROM pipeline_runs
    WHERE status = 'finished'
      AND publication_status = 'published'
    ORDER BY period ASC, published_at ASC
  `,
    )
    .all() as PublishedRunRow[];
}

/** Per published period: assetId → overall_score, for the matched-panel trend. */
export function collectPeriodAssetScores(dbPaths: string[]): PeriodScores[] {
  const result: PeriodScores[] = [];
  for (const dbPath of dbPaths) {
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const run of collectPublishedRuns(db)) {
        const rows = db
          .prepare(
            `SELECT asset_id, overall_score FROM scores WHERE run_id = ? AND overall_score IS NOT NULL`,
          )
          .all(run.run_id) as Array<{ asset_id: string; overall_score: number }>;
        const scores = new Map<string, number>();
        for (const r of rows) scores.set(r.asset_id, r.overall_score);
        result.push({ period: run.period, scores });
      }
    } finally {
      db.close();
    }
  }
  result.sort((a, b) => a.period.localeCompare(b.period));
  return result;
}

/**
 * Writes the post-stratified headline trend — but only when the operator supplies
 * a reference population frame at .input/population-frame.json. Without it, no
 * post-stratified numbers are emitted (publishing fabricated weights would break
 * the index's scientific integrity); the descriptive and panel trends still ship.
 */
export async function writePostStratTrends(
  comparisonsDir: string,
  dbPaths: string[],
): Promise<void> {
  const inputDir = path.resolve(process.cwd(), ".input");
  const frame = await loadPopulationFrame(inputDir);
  if (!frame) {
    console.log(
      "  · Post-stratified trend skipped — no .input/population-frame.json (supply a reference frame to enable)",
    );
    return;
  }

  const periods: { period: string; assets: { stratumKey: string; score: number }[] }[] = [];
  for (const dbPath of dbPaths) {
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const run of collectPublishedRuns(db)) {
        const rows = db
          .prepare(
            `SELECT a.bundesland, m.target_code AS destatis, s.overall_score
             FROM scores s
             JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
             LEFT JOIN asset_hwo_mappings m
               ON m.asset_id = s.asset_id AND m.mapping_system = 'destatis_group' AND m.run_id = s.run_id
             WHERE s.run_id = ? AND s.overall_score IS NOT NULL`,
          )
          .all(run.run_id) as Array<{
          bundesland: string | null;
          destatis: string | null;
          overall_score: number;
        }>;
        const assets = rows
          .filter((r) => r.bundesland && r.destatis)
          .map((r) => ({ stratumKey: `${r.bundesland}|${r.destatis}`, score: r.overall_score }));
        periods.push({ period: run.period, assets });
      }
    } finally {
      db.close();
    }
  }

  const trends = buildPostStratTrends(periods, frame);
  await writeJson(path.join(comparisonsDir, "poststrat-trends.json"), trends);
  await writeJson(path.join(comparisonsDir, "poststrat-manifest.json"), {
    strataSystem: frame.strataSystem,
    source: frame.source,
    minWeightCoverage: 0.6,
    periods: trends.map((t) => t.period),
    generatedAt: new Date().toISOString(),
  });
  console.log(`  ✓ Built post-stratified trend: ${trends.length} period(s)`);
}

/**
 * Writes the public methodology changelog (WP15) for the dashboard: the period-ordered
 * record of how the scoring instrument changed between published quarters — codebook /
 * ontology / scorer version bumps, same-version content changes, frame changes, and the
 * comparability-break flag. Sourced from the frozen run_methodology rows (never recomputed),
 * so it is a faithful, tamper-evident provenance trail. Absent run_methodology → empty
 * changelog (the Methodik page degrades to its static prose).
 */
export async function writeMethodologyChangelog(dbPaths: string[]): Promise<void> {
  const records: MethodologyRecord[] = [];
  for (const dbPath of dbPaths) {
    const db = new Database(dbPath, { readonly: true });
    try {
      const hasTable = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='run_methodology'")
        .get();
      if (!hasTable) continue;
      const rows = db
        .prepare(
          `SELECT pr.period, pr.run_id,
                  rm.methodology_hash, rm.codebook_id, rm.codebook_version, rm.ontology_version,
                  rm.scorer_version, rm.codebook_sha256, rm.ontology_sha256, rm.frame_sha256, rm.frozen_at
             FROM pipeline_runs pr
             JOIN run_methodology rm ON rm.run_id = pr.run_id
            WHERE pr.publication_status = 'published'`,
        )
        .all() as Array<{
        period: string;
        run_id: string;
        methodology_hash: string;
        codebook_id: string;
        codebook_version: string;
        ontology_version: string;
        scorer_version: string;
        codebook_sha256: string;
        ontology_sha256: string | null;
        frame_sha256: string | null;
        frozen_at: string;
      }>;
      for (const r of rows) {
        records.push({
          period: r.period,
          runId: r.run_id,
          methodologyHash: r.methodology_hash,
          codebookId: r.codebook_id,
          codebookVersion: r.codebook_version,
          ontologyVersion: r.ontology_version,
          scorerVersion: r.scorer_version,
          codebookSha256: r.codebook_sha256,
          ontologySha256: r.ontology_sha256,
          frameSha256: r.frame_sha256,
          frozenAt: r.frozen_at,
        });
      }
    } finally {
      db.close();
    }
  }

  const entries = buildChangelog(records);
  await writeJson(path.join(DASHBOARD_PUBLIC_DIR, "methodology-changelog.json"), {
    kind: "observatory-methodology-changelog",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries,
  });
  const breaks = entries.filter((e) => e.comparabilityBreak).length;
  console.log(`  ✓ Built methodology changelog: ${entries.length} period(s), ${breaks} break(s)`);
}
