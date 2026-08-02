/*
<MODULE_CONTRACT>
<purpose>Publication gate (WP8): validate a staging candidate run, then atomically promote the staging DB to canonical.</purpose>
<non-goals>
  <item>Never publishes from the pipeline run itself — that is deliberately decoupled (see run-app finalizeRun).</item>
  <item>Never mutates canonical without a timestamped backup first (reversible by design).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP8: staging + validate as the publication gate; promotion is a separate, reversible step.</item>
  <item>Finding 8: --allow-drift threads through the gate to acknowledge a confirmed real data shift.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { collectFindings, formatReport } from "./validate-core";

const CWD = process.cwd();
const CANONICAL_DIR = path.join(CWD, ".output", "db");
const STAGING_DIR = path.join(CANONICAL_DIR, "staging");
const BACKUP_DIR = path.join(CANONICAL_DIR, "backups");

const APPLY = process.argv.includes("--apply");
// Downgrade data-quality drift ERRORs to WARN when an operator has confirmed the shift is a
// real-world change, not a broken build (finding 8). Integrity errors are never downgraded.
const ALLOW_DRIFT = process.argv.includes("--allow-drift");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

type CandidateRun = { run_id: string; period: string; started_at: string };

function findCandidate(
  stagingPath: string,
  opts: { runId?: string; period?: string },
): CandidateRun | null {
  const db = new Database(stagingPath, { readonly: true });
  try {
    const filters = ["status = 'finished'", "publication_status = 'candidate'"];
    const args: unknown[] = [];
    if (opts.runId) {
      filters.push("run_id = ?");
      args.push(opts.runId);
    }
    if (opts.period) {
      filters.push("period = ?");
      args.push(opts.period);
    }
    const rows = db
      .prepare(
        `SELECT run_id, period, started_at FROM pipeline_runs
         WHERE ${filters.join(" AND ")}
         ORDER BY started_at DESC`,
      )
      .all(...args) as CandidateRun[];
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      console.log(
        `⚠️  ${rows.length} finished candidate runs in staging; selecting the newest ` +
          `(${rows[0]!.period} ${rows[0]!.run_id.slice(0, 8)}). Use --run-id to disambiguate.`,
      );
    }
    return rows[0]!;
  } finally {
    db.close();
  }
}

/** Marks the candidate published in staging, superseding any prior published run for its period. */
function markPublished(stagingPath: string, run: CandidateRun): void {
  const db = new Database(stagingPath);
  try {
    const publishedAt = new Date().toISOString();
    const tx = db.transaction(() => {
      const prior = db
        .prepare(
          `SELECT run_id FROM pipeline_runs
           WHERE period = ? AND publication_status = 'published' AND run_id != ?`,
        )
        .all(run.period, run.run_id) as Array<{ run_id: string }>;

      db.prepare(
        `UPDATE pipeline_runs SET publication_status = 'superseded'
         WHERE period = ? AND publication_status = 'published' AND run_id != ?`,
      ).run(run.period, run.run_id);

      db.prepare(
        `UPDATE pipeline_runs
         SET publication_status = 'published', published_at = ?, supersedes_run_id = ?
         WHERE run_id = ?`,
      ).run(publishedAt, prior[0]?.run_id ?? null, run.run_id);
    });
    tx();
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const runId = argValue("--run-id");
  const period = argValue("--period");
  const dbFile = `observatory_${year}.db`;
  const stagingPath = path.join(STAGING_DIR, dbFile);
  const canonicalPath = path.join(CANONICAL_DIR, dbFile);

  console.log("📤 Promote staging → canonical (publication gate)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    APPLY
      ? "   mode: APPLY (swaps canonical)"
      : "   mode: DRY-RUN (validate only; pass --apply to promote)",
  );
  console.log(`   staging: ${stagingPath}`);

  if (!(await exists(stagingPath))) {
    throw new Error(
      `No staging DB at ${stagingPath}. Run the pipeline first (pnpm run start) to produce a candidate.`,
    );
  }

  const candidate = findCandidate(stagingPath, { runId, period });
  if (!candidate) {
    throw new Error(
      "No finished candidate run found in staging (filters: " +
        JSON.stringify({ runId, period }) +
        "). Did the pipeline finish successfully?",
    );
  }
  // Guard: run-id/period point at the requested year's DB.
  parsePeriod(candidate.period); // throws if malformed
  console.log(`   candidate: ${candidate.period} run=${candidate.run_id.slice(0, 8)}`);

  // ── Gate: validate staging as if the candidate were promoted ────────────────
  console.log("\n🔎 Validating staging (candidate treated as published)…");
  const gate = collectFindings(stagingPath, {
    candidateRunIds: [candidate.run_id],
    allowDrift: ALLOW_DRIFT,
  });
  const report = formatReport(gate);
  if (report.text) console.log(report.text);
  console.log(`\nGate result: ${report.errors} error(s), ${report.warns} warning(s)`);

  if (report.errors > 0) {
    process.exitCode = 1;
    console.log(
      "❌ ABORT — canonical untouched. Fix ERROR findings, re-run the pipeline, and retry.",
    );
    return;
  }

  if (!APPLY) {
    console.log(
      `✅ PASS — would promote ${candidate.period} run ${candidate.run_id.slice(0, 8)} to canonical. ` +
        "Re-run with --apply to publish.",
    );
    return;
  }

  // ── Apply: mark published in staging, re-validate, back up, swap ────────────
  markPublished(stagingPath, candidate);

  const postFindings = collectFindings(stagingPath, { allowDrift: ALLOW_DRIFT });
  const post = formatReport(postFindings);
  if (post.errors > 0) {
    process.exitCode = 1;
    if (post.text) console.log(post.text);
    console.log(
      "❌ ABORT — post-publish validation failed; canonical untouched (staging is disposable).",
    );
    return;
  }

  // Back up the current canonical DB (reversible) before overwriting it.
  if (await exists(canonicalPath)) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `${dbFile}.${stamp}.bak`);
    const cur = new Database(canonicalPath, { readonly: true });
    try {
      await cur.backup(backupPath);
    } finally {
      cur.close();
    }
    console.log(`\n🗄  Backed up current canonical → ${backupPath}`);
  }

  // Atomic-consistent swap: write staging's contents into canonical via the
  // SQLite online backup API (safe against WAL, produces a single clean file).
  const staged = new Database(stagingPath, { readonly: true });
  try {
    await staged.backup(canonicalPath);
  } finally {
    staged.close();
  }
  // Clear any stale WAL/SHM sidecars next to canonical from a previous open.
  for (const suffix of ["-wal", "-shm"]) {
    await fs.rm(`${canonicalPath}${suffix}`, { force: true });
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `✅ Promoted ${candidate.period} run ${candidate.run_id.slice(0, 8)} → ${canonicalPath}`,
  );
  console.log("   Next: pnpm run validate  (canonical)  →  pnpm run export:dashboard");
}

void main().catch((error: unknown) => {
  console.error("[promote-to-canonical] Failed:", error);
  process.exitCode = 1;
});
