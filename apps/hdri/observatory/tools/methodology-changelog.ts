/*
<MODULE_CONTRACT>
<purpose>Operator CLI for the methodology changelog (WP15). Reads the frozen per-run methodology
records (WP12 run_methodology + WP15 frame hash) for every PUBLISHED period from the canonical DB
and emits a period-ordered changelog — machine JSON + human Markdown — stating exactly what changed
between periods and flagging comparability breaks.</purpose>
<non-goals>
  <item>Does not freeze content — that is snapshot-methodology.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP15: initial methodology changelog generator tool.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { outputRootDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import {
  buildChangelog,
  renderChangelogJson,
  renderChangelogMarkdown,
  type MethodologyRecord,
} from "./methodology-changelog-core";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Row = {
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
};

/** Reads published methodology records across the given years' canonical DBs. */
function readRecords(dbPath: string): MethodologyRecord[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT pr.period, pr.run_id,
                rm.methodology_hash, rm.codebook_id, rm.codebook_version, rm.ontology_version,
                rm.scorer_version, rm.codebook_sha256, rm.ontology_sha256, rm.frame_sha256, rm.frozen_at
           FROM pipeline_runs pr
           JOIN run_methodology rm ON rm.run_id = pr.run_id
          WHERE pr.publication_status = 'published'`,
      )
      .all() as Row[];
    return rows.map((r) => ({
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
    }));
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const yearArg = argValue("--year");
  const years = yearArg ? [Number(yearArg)] : await discoverYears();
  const outDir = path.resolve(argValue("--out-dir") ?? outputRootDir);

  console.log("📜 Methodology changelog (WP15)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const records: MethodologyRecord[] = [];
  for (const year of years) {
    const dbPath = getObservatoryDbPath(year);
    try {
      await fs.access(dbPath);
    } catch {
      continue;
    }
    records.push(...readRecords(dbPath));
  }

  if (records.length === 0) {
    console.log("No published methodology records found. Nothing to write.");
    return;
  }

  const entries = buildChangelog(records);
  const jsonPath = path.join(outDir, "methodology-changelog.json");
  const mdPath = path.join(outDir, "METHODOLOGY-CHANGELOG.md");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(jsonPath, renderChangelogJson(entries), "utf-8");
  await fs.writeFile(mdPath, renderChangelogMarkdown(entries), "utf-8");

  const breaks = entries.filter((e) => e.comparabilityBreak).length;
  for (const e of entries) {
    const flag = e.comparabilityBreak ? " ⚠️ break" : "";
    console.log(`   ${e.period}  ${e.status}${flag}  (${e.changes.length} change(s))`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `Wrote ${entries.length} period(s), ${breaks} comparability break(s):\n   ${jsonPath}\n   ${mdPath}`,
  );
}

/** Every year with a canonical observatory_YYYY.db. */
async function discoverYears(): Promise<number[]> {
  const dbDir = path.join(outputRootDir, "db");
  try {
    const entries = await fs.readdir(dbDir);
    return entries
      .map((f) => /^observatory_(\d{4})\.db$/i.exec(f)?.[1])
      .filter((y): y is string => Boolean(y))
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

void main().catch((error: unknown) => {
  console.error("[methodology-changelog] Failed:", error);
  process.exitCode = 1;
});
