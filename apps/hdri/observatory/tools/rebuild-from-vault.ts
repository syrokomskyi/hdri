/*
<MODULE_CONTRACT>
<purpose>Operator CLI for rebuild-from-vault (WP7 / P0 disaster-recovery): reconstruct a fresh
observatory DB purely from the signed Parquet vault (+ emit-bundle fallback for asset_states),
re-score it under the frozen codebook, and optionally verify it reproduces a source DB's
computation_hashes. The vault — not the working DB — is the recoverable source of truth.</purpose>
<non-goals>
  <item>Never writes the canonical observatory_YYYY.db — emits a separate rebuilt DB.</item>
  <item>Does not re-verify ed25519 signatures — use verify-vault for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP7: initial rebuild-from-vault tool.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import Database from "better-sqlite3";
import { VaultReader } from "@syrokomskyi/observatory-vault";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import { newId } from "@syrokomskyi/observatory-core";
import { readEmitBundle, streamAssetStates } from "@syrokomskyi/observatory-emit";
import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { migrateObservatory } from "../run/db/migrate";
import { getDbDir, getObservatoryDbPath } from "../run/db/connection";
import { writeAssetStatesDeduped, type AssetStateInput } from "../run/db/sync-writers";
import { scoreAndWriteForRun } from "../run/score/score-core";
import {
  bundleAssetStatesToInputs,
  insertRebuiltObservations,
  vaultAssetStatesToInputs,
} from "../run/rebuild/rebuild-core";
import { inputDir, outputRootDir } from "../run/config";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));
  const targetDbPath = path.resolve(
    argValue("--target-db") ?? path.join(getDbDir(), `observatory_rebuilt_${year}.db`),
  );
  const codebookPath = path.resolve(argValue("--codebook") ?? path.join(inputDir, "codebook.yaml"));
  const runId = argValue("--run-id") ?? newId();
  const ontologyVersion = argValue("--ontology-version") ?? "unknown";
  const emitDir = argValue("--emit-dir");
  const comparePath = argValue("--compare");
  const sourceRunId = argValue("--source-run-id");

  // Guard against clobbering the canonical DB.
  if (targetDbPath === path.resolve(getObservatoryDbPath(year))) {
    throw new Error(
      `Refusing to write the canonical DB (${targetDbPath}). Pass a different --target-db.`,
    );
  }

  console.log(`🔧 Rebuild-from-vault  year=${year}`);
  console.log(`   vault:     ${vaultDir}`);
  console.log(`   target DB: ${targetDbPath}`);
  console.log(`   run_id:    ${runId}`);

  await mkdir(path.dirname(targetDbPath), { recursive: true });

  const reader = new VaultReader(vaultDir);

  // 1. Asset states from the vault (self-contained, carry the period). The first record's
  //    period becomes the rebuild period; fall back to --period or the year.
  const vaultStates = await reader.getAssetStateRecords(year);
  let stateInputs: AssetStateInput[] = vaultAssetStatesToInputs(vaultStates);
  let period = argValue("--period") ?? stateInputs.find((s) => s.period)?.period ?? String(year);

  // Fallback: re-derive asset_states from an emit-bundle if the vault has none (pre-WP7 vaults).
  if (stateInputs.length === 0 && emitDir) {
    const bundle = await readEmitBundle(path.resolve(emitDir));
    period = argValue("--period") ?? bundle.manifest.period;
    const records: AssetStateRecord[] = [];
    for await (const st of streamAssetStates(bundle)) records.push(st);
    stateInputs = bundleAssetStatesToInputs(records, period);
    console.log(`   asset_states: ${records.length} re-derived from emit-bundle (vault had none)`);
  }

  // 2. Observations from the vault → fresh DB.
  const db = new Database(targetDbPath);
  db.pragma("journal_mode = WAL");
  migrateObservatory(db);

  let insertedObs = 0;
  let seenObs = 0;
  for await (const rows of reader.streamAllObservations(year)) {
    seenObs += rows.length;
    insertedObs += insertRebuiltObservations(db, rows, { runId, period, ontologyVersion });
    if (seenObs % 100_000 < rows.length) console.log(`   observations streamed: ${seenObs}`);
  }
  if (seenObs === 0) {
    db.close();
    reader.close();
    throw new Error(`No observation shards found in the vault for year ${year} at ${vaultDir}`);
  }
  const insertedStates = writeAssetStatesDeduped(db, stateInputs, {
    runId,
    now: new Date().toISOString(),
  });
  console.log(`   ✓ observations rebuilt: ${insertedObs}`);
  console.log(`   ✓ asset_states rebuilt: ${insertedStates}`);

  // 3. Re-score with the frozen codebook (same path as the live pipeline).
  const codebook = parseCodebookOrThrow(await readFile(codebookPath, "utf-8"), codebookPath);
  const summary = scoreAndWriteForRun(db, codebook, {
    runId,
    period,
    now: new Date().toISOString(),
  });
  console.log(
    `   ✓ re-scored: ${summary.scored} scored, ${summary.skipped} skipped ` +
      `(codebook ${codebook.id} v${codebook.version})`,
  );

  db.prepare(
    `INSERT OR REPLACE INTO pipeline_runs
       (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_id, codebook_version, started_at, status, publication_status)
     VALUES (?, 'observatory', 'rebuild', ?, ?, ?, ?, ?, 'finished', 'candidate')`,
  ).run(runId, period, ontologyVersion, codebook.id, codebook.version, new Date().toISOString());

  // 4. Optional integrity gate: compare computation_hashes against a source DB run.
  let exitCode = 0;
  if (comparePath) {
    const src = new Database(path.resolve(comparePath), { readonly: true });
    const srcRows = (
      sourceRunId
        ? src
            .prepare(`SELECT asset_id, computation_hash FROM scores WHERE run_id = ?`)
            .all(sourceRunId)
        : src.prepare(`SELECT asset_id, computation_hash FROM scores`).all()
    ) as Array<{ asset_id: string; computation_hash: string }>;
    src.close();

    const srcByAsset = new Map(srcRows.map((r) => [r.asset_id, r.computation_hash]));
    let matched = 0;
    const mismatches: string[] = [];
    for (const [assetId, score] of summary.perAsset) {
      const srcHash = srcByAsset.get(assetId);
      if (srcHash === undefined) continue;
      if (srcHash === score.computationHash) matched += 1;
      else mismatches.push(assetId);
    }
    if (mismatches.length === 0) {
      console.log(
        `   ✓ compare: all ${matched} overlapping computation_hashes match ${comparePath}`,
      );
    } else {
      console.log(
        `   ❌ compare: ${mismatches.length} computation_hash mismatch(es), ${matched} matched`,
      );
      for (const a of mismatches.slice(0, 20)) console.log(`        mismatch: ${a}`);
      exitCode = 1;
    }
  }

  db.close();
  reader.close();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✓ Rebuild complete → ${targetDbPath}`);
  process.exitCode = exitCode;
}

void main().catch((error: unknown) => {
  console.error("[rebuild-from-vault] Failed:", error);
  process.exitCode = 1;
});
