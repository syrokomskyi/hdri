/*
<MODULE_CONTRACT>
<purpose>Operator CLI for frozen per-period methodology snapshots (WP15). Freezes the EXACT
codebook + ontology + population-frame that produced each published period into a durable,
content-addressed store under the vault, verified against the WP12 run_methodology hashes — so the
DR runbook's "frozen inputs for the period" prerequisite is a real, auditable artifact. Also
verifies the store. Dry-run by default.</purpose>
<non-goals>
  <item>Never overwrites a period's snapshot with a different methodology_hash (unless --force).</item>
  <item>Does not generate the changelog — that is methodology-changelog.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP15: initial methodology snapshot operator tool.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { sha256 } from "@syrokomskyi/observatory-core";
import { inputDir, outputRootDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import {
  freezeMethodologySnapshot,
  verifyMethodologyStore,
  type FreezeInput,
} from "./methodology-snapshot-core";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const FORCE = process.argv.includes("--force");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type MethodologyRow = {
  period: string;
  run_id: string;
  methodology_hash: string;
  codebook_version: string;
  ontology_version: string;
  codebook_sha256: string;
  ontology_sha256: string | null;
  frame_sha256: string | null;
};

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

/** Published runs with a frozen methodology, newest period last. Optionally filtered to --period. */
function publishedMethodologies(dbPath: string, period?: string): MethodologyRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const filters = ["pr.publication_status = 'published'"];
    const args: unknown[] = [];
    if (period) {
      filters.push("pr.period = ?");
      args.push(period);
    }
    return db
      .prepare(
        `SELECT pr.period, pr.run_id,
                rm.methodology_hash, rm.codebook_version, rm.ontology_version,
                rm.codebook_sha256, rm.ontology_sha256, rm.frame_sha256
           FROM pipeline_runs pr
           JOIN run_methodology rm ON rm.run_id = pr.run_id
          WHERE ${filters.join(" AND ")}
          ORDER BY pr.period`,
      )
      .all(...args) as MethodologyRow[];
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const period = argValue("--period");
  const storeDir = path.resolve(
    argValue("--store-dir") ?? path.join(outputRootDir, "vault", "methodology"),
  );
  const dbPath = getObservatoryDbPath(year);

  console.log("🧊 Methodology snapshot — freeze per-period codebook/ontology/frame (WP15)");
  console.log(`   store: ${storeDir}`);

  if (VERIFY) {
    const res = await verifyMethodologyStore(storeDir);
    console.log(
      `   verify: ${res.ok ? "PASS" : "FAIL"} — ${res.checked} blob(s), ` +
        `${res.missing.length} missing, ${res.corrupted.length} corrupted`,
    );
    for (const m of res.missing) console.log(`      MISSING   ${m}`);
    for (const c of res.corrupted) console.log(`      CORRUPTED ${c}`);
    process.exitCode = res.ok ? 0 : 1;
    return;
  }

  console.log(APPLY ? "   mode: APPLY (writes store)" : "   mode: DRY-RUN (no changes)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const rows = publishedMethodologies(dbPath, period);
  if (rows.length === 0) {
    console.log(`No published runs with frozen methodology in ${path.basename(dbPath)}`);
    return;
  }

  // Current .input content (conventional paths). The expected-hash guard rejects mismatches.
  const codebookSource = await readIfExists(path.join(inputDir, "codebook.yaml"));
  const ontologySource = await readIfExists(path.join(inputDir, "ontology.yaml"));
  const frameSource = await readIfExists(path.join(inputDir, "population-frame.json"));

  if (codebookSource === null) {
    throw new Error(`No .input/codebook.yaml to freeze at ${inputDir}`);
  }

  for (const row of rows) {
    const codebook: FreezeInput = {
      source: codebookSource,
      version: row.codebook_version,
      expectedSha256: row.codebook_sha256,
    };
    const ontology: FreezeInput | null =
      row.ontology_sha256 && ontologySource !== null
        ? {
            source: ontologySource,
            version: row.ontology_version,
            expectedSha256: row.ontology_sha256,
          }
        : null;
    const frame: FreezeInput | null =
      row.frame_sha256 && frameSource !== null
        ? { source: frameSource, version: null, expectedSha256: row.frame_sha256 }
        : null;

    try {
      if (!APPLY) {
        // Dry-run: hash-check without writing by attempting a freeze into a throwaway check.
        console.log(
          `   · ${row.period} ${row.run_id.slice(0, 8)}  methodology ${row.methodology_hash.slice(0, 12)}` +
            `  codebook v${row.codebook_version}${ontology ? `, ontology v${row.ontology_version}` : ""}${frame ? ", frame" : ""}`,
        );
        // Verify hashes match current .input without writing.
        assertHash("codebook", codebookSource, row.codebook_sha256, row.period);
        if (ontology) assertHash("ontology", ontology.source, row.ontology_sha256!, row.period);
        if (frame) assertHash("frame", frame.source, row.frame_sha256!, row.period);
        console.log(`      ✓ .input matches recorded hashes (would freeze)`);
        continue;
      }
      const res = await freezeMethodologySnapshot(
        storeDir,
        row.period,
        row.methodology_hash,
        { codebook, ontology, frame },
        { force: FORCE },
      );
      console.log(
        `   ✓ ${row.period} ${row.run_id.slice(0, 8)}  froze ${res.blobs.length} input(s)` +
          `, ${res.written} new blob(s)${res.alreadyFrozen ? " (already frozen)" : ""}`,
      );
    } catch (err) {
      process.exitCode = 1;
      console.log(
        `   ✗ ${row.period}  BLOCKED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    APPLY
      ? "Done. Verify anytime with `pnpm run snapshot:methodology:verify`."
      : "Dry-run complete. Re-run with --apply to freeze.",
  );
}

function assertHash(role: string, source: string, expected: string, period: string): void {
  const got = sha256(source);
  if (got !== expected) {
    throw new Error(
      `${role} .input sha256 ${got.slice(0, 12)} != recorded ${expected.slice(0, 12)} for ${period}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[snapshot-methodology] Failed:", error);
  process.exitCode = 1;
});
