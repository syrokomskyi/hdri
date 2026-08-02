/*
<MODULE_CONTRACT>
<purpose>Garbage-collect derived rows of superseded/failed observatory runs to control DB growth.</purpose>
<non-goals>
  <item>NEVER deletes observations, asset_states, asset_hwo_mappings, asset_id_map, synced_bundles, or pipeline_runs — observations feed the signed vault and must be preserved; asset_states preserve SCD-2 lineage.</item>
  <item>Never touches candidate/running or published runs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP2: explicit, auditable GC tool for superseded/failed run derived data; dry-run default.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const OUTPUT_DIR = path.resolve(process.cwd(), ".output");
const DB_DIR = path.join(OUTPUT_DIR, "db");

const APPLY = process.argv.includes("--apply");
const VACUUM = process.argv.includes("--vacuum");

type DeadRun = {
  run_id: string;
  period: string;
  status: string;
  publication_status: string | null;
};

async function findObservatoryDbs(): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(DB_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /^observatory_\d{4}\.db$/i.test(e.name))
    .map((e) => path.join(DB_DIR, e.name))
    .sort();
}

function gcDb(dbPath: string): { runs: number; deleted: Record<string, number> } {
  const dbName = path.basename(dbPath);
  const db = new Database(dbPath);
  try {
    const deadRuns = db
      .prepare(
        `SELECT run_id, period, status, publication_status
         FROM pipeline_runs
         WHERE status = 'failed' OR publication_status = 'superseded'`,
      )
      .all() as DeadRun[];

    if (deadRuns.length === 0) {
      console.log(`  [${dbName}] no superseded/failed runs — nothing to reclaim`);
      return { runs: 0, deleted: {} };
    }

    const runIds = deadRuns.map((r) => r.run_id);
    const placeholders = runIds.map(() => "?").join(", ");
    const scoreIdSubquery = `SELECT id FROM scores WHERE run_id IN (${placeholders})`;

    const countOf = (sql: string, args: unknown[] = runIds): number =>
      (db.prepare(sql).get(...args) as { c: number }).c;

    const counts = {
      score_indicator_traces: countOf(
        `SELECT COUNT(*) c FROM score_indicator_traces WHERE score_id IN (${scoreIdSubquery})`,
      ),
      score_dimensions: countOf(
        `SELECT COUNT(*) c FROM score_dimensions WHERE score_id IN (${scoreIdSubquery})`,
      ),
      scores: countOf(`SELECT COUNT(*) c FROM scores WHERE run_id IN (${placeholders})`),
      cohort_aggregates: countOf(
        `SELECT COUNT(*) c FROM cohort_aggregates WHERE cohort_id IN (SELECT id FROM cohorts WHERE run_id IN (${placeholders}))`,
      ),
      cohort_members: countOf(
        `SELECT COUNT(*) c FROM cohort_members WHERE cohort_id IN (SELECT id FROM cohorts WHERE run_id IN (${placeholders}))`,
      ),
      cohorts: countOf(`SELECT COUNT(*) c FROM cohorts WHERE run_id IN (${placeholders})`),
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `  [${dbName}] ${deadRuns.length} dead run(s); reclaimable rows: ${JSON.stringify(counts)}`,
    );
    for (const r of deadRuns) {
      console.log(
        `      · ${r.period} ${r.run_id.slice(0, 8)} status=${r.status} pub=${r.publication_status}`,
      );
    }

    if (APPLY && total > 0) {
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM score_indicator_traces WHERE score_id IN (${scoreIdSubquery})`).run(
          ...runIds,
        );
        db.prepare(`DELETE FROM score_dimensions WHERE score_id IN (${scoreIdSubquery})`).run(
          ...runIds,
        );
        db.prepare(`DELETE FROM scores WHERE run_id IN (${placeholders})`).run(...runIds);
        db.prepare(
          `DELETE FROM cohort_aggregates WHERE cohort_id IN (SELECT id FROM cohorts WHERE run_id IN (${placeholders}))`,
        ).run(...runIds);
        db.prepare(
          `DELETE FROM cohort_members WHERE cohort_id IN (SELECT id FROM cohorts WHERE run_id IN (${placeholders}))`,
        ).run(...runIds);
        db.prepare(`DELETE FROM cohorts WHERE run_id IN (${placeholders})`).run(...runIds);
      });
      tx();
      console.log(`      ✓ deleted ${total} row(s)`);
      if (VACUUM) {
        console.log(`      · VACUUM ${dbName} … (this can take a while and needs free disk)`);
        db.exec("VACUUM");
        console.log(`      ✓ vacuumed`);
      }
    }

    return { runs: deadRuns.length, deleted: APPLY ? counts : {} };
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  console.log("🧹 Observatory GC — superseded/failed run derived data");
  console.log(
    APPLY ? "   mode: APPLY (deletes)" : "   mode: DRY-RUN (no changes; pass --apply to delete)",
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const dbPaths = await findObservatoryDbs();
  if (dbPaths.length === 0) {
    console.log(`No observatory_YYYY.db found in ${DB_DIR}`);
    return;
  }
  let totalRuns = 0;
  for (const dbPath of dbPaths) {
    totalRuns += gcDb(dbPath).runs;
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!APPLY) {
    console.log(
      `Dry-run complete: ${totalRuns} dead run(s) across all DBs. Re-run with --apply to reclaim.`,
    );
  } else {
    console.log(`Done. Processed ${totalRuns} dead run(s).`);
  }
  console.log(
    "Note: observations and asset_states are deliberately preserved (vault/SCD-2 lineage).",
  );
}

void main().catch((error: unknown) => {
  console.error("[gc-superseded] Failed:", error);
  process.exitCode = 1;
});
