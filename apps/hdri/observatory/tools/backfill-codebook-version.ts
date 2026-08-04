/*
<MODULE_CONTRACT>
<purpose>Correct pipeline_runs.codebook_version and populate codebook_id (WP16 finding-3). Historically
pipeline_runs.codebook_version stored the brief's codebookVersion — which is the codebook *id*
("observatory-v1"), not the real scoring version ("1.3.0"). The authoritative version lives in
scores.codebook_version (what actually scored the run); validate flags the mismatch as a WARN.
This tool relabels pipeline_runs to the authoritative scoring version and populates codebook_id
from scores.codebook_id — ONLY when the run's scores unanimously use one version/id and it differs.
It corrects labels; it never touches a score, percentile, or the frozen methodology_hash, so
published index VALUES are unchanged. Dry-run by default; --apply takes a protective backup first.</purpose>
<non-goals>
  <item>Never changes scores, cohorts, marts, or run_methodology — only the pipeline_runs label.</item>
  <item>Refuses (exit 1) a run whose scores mix codebook versions — cannot attribute one.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 finding-3: guarded relabel of pipeline_runs.codebook_version to the scoring version.</item>
  <item>Also populate pipeline_runs.codebook_id from scores.codebook_id for legacy runs.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import path from "node:path";
import Database from "better-sqlite3";
import { getObservatoryDbPath } from "../run/db/connection";
import { backupDatabase } from "../run/db/backup";

const APPLY = process.argv.includes("--apply");
// Opt-in full-DB backup. The change is a single reversible label on one tiny row (old→new is
// printed), so a multi-GB VACUUM INTO of the whole DB is disproportionate by default and would
// dominate/stall the run; --backup is there for the operator who still wants the safety net.
const BACKUP = process.argv.includes("--backup");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Fix = {
  runId: string;
  period: string;
  fromVersion: string;
  toVersion: string;
  codebookId: string;
};

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const period = argValue("--period");
  const dbPath = getObservatoryDbPath(year);

  console.log(
    "🏷  Backfill pipeline_runs.codebook_version → authoritative scoring version (finding-3)",
  );
  console.log(APPLY ? "   mode: APPLY (updates pipeline_runs)" : "   mode: DRY-RUN (no changes)");
  console.log(`   db: ${path.basename(dbPath)}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const db = new Database(dbPath, { readonly: !APPLY });
  try {
    const filters: string[] = [];
    const args: unknown[] = [];
    if (period) {
      filters.push("period = ?");
      args.push(period);
    }
    const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
    const runs = db
      .prepare(
        `SELECT run_id, period, codebook_version, codebook_id FROM pipeline_runs${where} ORDER BY period`,
      )
      .all(...args) as Array<{
      run_id: string;
      period: string;
      codebook_version: string;
      codebook_id: string | null;
    }>;

    const toFix: Fix[] = [];
    let inSync = 0;
    let noScores = 0;
    for (const run of runs) {
      const scored = db
        .prepare(`SELECT DISTINCT codebook_id, codebook_version FROM scores WHERE run_id = ?`)
        .all(run.run_id) as Array<{ codebook_id: string; codebook_version: string }>;
      if (scored.length === 0) {
        noScores++;
        continue;
      }
      if (scored.length > 1) {
        console.log(
          `   ✗ ${run.period} ${run.run_id.slice(0, 8)}  BLOCKED: scores mix ${scored.length} codebook versions [${scored.map((s) => s.codebook_version).join(", ")}] — cannot attribute one`,
        );
        process.exitCode = 1;
        continue;
      }
      const authVersion = scored[0]!.codebook_version;
      const authId = scored[0]!.codebook_id;
      const versionMismatch = run.codebook_version !== authVersion;
      const idMissing = !run.codebook_id;
      if (!versionMismatch && !idMissing) {
        inSync++;
        continue;
      }
      toFix.push({
        runId: run.run_id,
        period: run.period,
        fromVersion: run.codebook_version,
        toVersion: authVersion,
        codebookId: authId,
      });
      const changes: string[] = [];
      if (versionMismatch)
        changes.push(`codebook_version "${run.codebook_version}" → "${authVersion}"`);
      if (idMissing) changes.push(`codebook_id NULL → "${authId}"`);
      console.log(`   ~ ${run.period} ${run.run_id.slice(0, 8)}  ${changes.join(", ")}`);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `   ${toFix.length} to relabel, ${inSync} already correct, ${noScores} without scores`,
    );

    if (toFix.length === 0) {
      console.log("Nothing to relabel.");
      return;
    }
    if (!APPLY) {
      console.log(
        "Dry-run complete. Re-run with --apply to relabel (add --backup for a full-DB copy first).",
      );
      return;
    }

    if (BACKUP) {
      console.log("   · taking a full-DB backup (VACUUM INTO) — this can be slow on a large DB…");
      const backup = backupDatabase(db, "codebook-version-backfill");
      if (backup) console.log(`   · backup: ${path.basename(backup)}`);
    }
    const stmt = db.prepare(
      `UPDATE pipeline_runs SET codebook_version = ?, codebook_id = ? WHERE run_id = ?`,
    );
    const tx = db.transaction((fixes: Fix[]) => {
      for (const f of fixes) stmt.run(f.toVersion, f.codebookId, f.runId);
    });
    tx(toFix);
    console.log(
      `✅ Relabeled ${toFix.length} run(s). Re-run \`pnpm run validate\` — the WARN should clear.`,
    );
    console.log(
      "   To revert a run: UPDATE pipeline_runs SET codebook_version = '<old>' WHERE run_id = '<id>';",
    );
    for (const f of toFix) {
      console.log(
        `     ${f.runId}: codebook_version "${f.toVersion}" (was "${f.fromVersion}"), codebook_id "${f.codebookId}"`,
      );
    }
  } finally {
    db.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[backfill-codebook-version] Failed:", error);
  process.exitCode = 1;
});
