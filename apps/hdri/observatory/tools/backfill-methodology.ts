/*
<MODULE_CONTRACT>
<purpose>Backfill the WP12 methodology freeze for PUBLISHED runs scored before run_methodology
existed (WP15 follow-up). For each published run with no run_methodology row, compute the
fingerprint from the current .input codebook/ontology/frame and freeze it — but ONLY when the
current codebook's id+version matches what the run's scores were actually computed under, so a
drifted .input can never be mis-attributed to a past period.</purpose>
<non-goals>
  <item>Never overwrites an existing run_methodology row (writeRunMethodology is INSERT OR IGNORE).</item>
  <item>Does not re-score; assumes current .input is the methodology that produced the run (guarded).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP15 follow-up: guarded backfill of run_methodology for pre-WP12 published runs.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import { parseOntology, sha256 } from "@syrokomskyi/observatory-core";
import { inputDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import { computeMethodologyFingerprint, writeRunMethodology } from "../run/score/methodology-core";

const APPLY = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

/** Scorer (@syrokomskyi/hdri-codebook) package version — same resolution the live scorer uses. */
function readScorerVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@syrokomskyi/hdri-codebook/package.json") as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

type Row = { run_id: string; period: string; ontology_version: string };

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const period = argValue("--period");
  const dbPath = getObservatoryDbPath(year);

  console.log("🧬 Backfill run_methodology for pre-WP12 published runs (WP15 follow-up)");
  console.log(APPLY ? "   mode: APPLY (writes run_methodology)" : "   mode: DRY-RUN (no changes)");
  console.log(`   db: ${path.basename(dbPath)}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Parse current .input methodology.
  const codebookSource = await readIfExists(path.join(inputDir, "codebook.yaml"));
  if (codebookSource === null) throw new Error(`No .input/codebook.yaml at ${inputDir}`);
  const codebook = parseCodebookOrThrow(codebookSource, "codebook.yaml");

  let ontologySource: string | null = null;
  let ontologyVersionFromFile: string | null = null;
  if (codebook.ontologyRef) {
    const op = path.isAbsolute(codebook.ontologyRef)
      ? codebook.ontologyRef
      : path.join(inputDir, codebook.ontologyRef);
    ontologySource = await readIfExists(op);
    if (ontologySource)
      ontologyVersionFromFile = parseOntology(ontologySource, path.basename(op)).version;
  }
  const frameSource = await readIfExists(path.join(inputDir, "population-frame.json"));
  const scorerVersion = readScorerVersion();

  const db = new Database(dbPath);
  try {
    const filters = ["pr.publication_status = 'published'", "rm.run_id IS NULL"];
    const args: unknown[] = [];
    if (period) {
      filters.push("pr.period = ?");
      args.push(period);
    }
    const rows = db
      .prepare(
        `SELECT pr.run_id, pr.period, pr.ontology_version
           FROM pipeline_runs pr
           LEFT JOIN run_methodology rm ON rm.run_id = pr.run_id
          WHERE ${filters.join(" AND ")}
          ORDER BY pr.period`,
      )
      .all(...args) as Row[];

    if (rows.length === 0) {
      console.log("No published runs are missing a run_methodology row. Nothing to backfill.");
      return;
    }

    let wrote = 0;
    for (const row of rows) {
      // Guard: current .input codebook must be what THIS run's scores were computed under.
      const scored = db
        .prepare(`SELECT DISTINCT codebook_id, codebook_version FROM scores WHERE run_id = ?`)
        .all(row.run_id) as Array<{ codebook_id: string; codebook_version: string }>;

      if (scored.length !== 1) {
        console.log(
          `   ✗ ${row.period} ${row.run_id.slice(0, 8)}  BLOCKED: ${scored.length} distinct scored codebook(s) — cannot attribute`,
        );
        process.exitCode = 1;
        continue;
      }
      const s = scored[0]!;
      if (s.codebook_id !== codebook.id || s.codebook_version !== codebook.version) {
        console.log(
          `   ✗ ${row.period} ${row.run_id.slice(0, 8)}  BLOCKED: scored ${s.codebook_id} v${s.codebook_version} ` +
            `!= .input ${codebook.id} v${codebook.version} — .input has drifted; re-point .input or re-score`,
        );
        process.exitCode = 1;
        continue;
      }

      const ontologyVersion = ontologyVersionFromFile ?? row.ontology_version;
      const fp = computeMethodologyFingerprint({
        codebookId: codebook.id,
        codebookVersion: codebook.version,
        ontologyVersion,
        scorerVersion,
        codebookSource,
        ontologySource,
      });
      const frameSha256 = frameSource ? sha256(frameSource) : null;

      console.log(
        `   ✓ ${row.period} ${row.run_id.slice(0, 8)}  methodology ${fp.methodologyHash.slice(0, 12)} ` +
          `(codebook ${fp.codebookId} v${fp.codebookVersion}, ontology v${fp.ontologyVersion}, scorer ${fp.scorerVersion}` +
          `${frameSha256 ? ", frame" : ", no frame"})`,
      );
      if (APPLY) {
        if (writeRunMethodology(db, row.run_id, fp, new Date().toISOString(), frameSha256)) wrote++;
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      APPLY
        ? `Done. Wrote ${wrote} run_methodology row(s). Next: pnpm run snapshot:methodology -- --apply && pnpm run methodology:changelog`
        : "Dry-run complete. Re-run with --apply to freeze the row(s).",
    );
  } finally {
    db.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[backfill-methodology] Failed:", error);
  process.exitCode = 1;
});
