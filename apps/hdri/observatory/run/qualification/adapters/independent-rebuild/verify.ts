/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for independent-rebuild: compares the rebuilt DB against the translation DB row-by-row on every semantic column.</purpose>
  <non-goals><item>Does not trust counts — full row comparison on all value/provenance/signature fields.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: independent-rebuild verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  emitVerification,
  fail,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const stageDir = scratchPath(args.workRoot, "work/independent-rebuild");

const rebuilt = new Database(path.join(stageDir, "rebuilt.sqlite"), { readonly: true });
const original = new Database(
  scratchPath(args.workRoot, "work/translation/observations.sqlite"),
  { readonly: true },
);

const COLUMNS = [
  "id", "asset_id", "signal_path", "ontology_version",
  "value_bool", "value_num", "value_str", "value_json", "value_type",
  "observed_at", "recorded_at", "run_id", "evidence_ref", "extractor_version",
  "confidence", "status", "signature", "signing_key_id", "collector_id",
  "collection_status", "period", "crawl_hash",
] as const;

const origRows = new Map(
  (
    original
      .prepare(`SELECT ${COLUMNS.join(", ")} FROM observations`)
      .all() as Record<string, unknown>[]
  ).map((r) => [r.id as string, r]),
);
const rebuiltRows = rebuilt
  .prepare(`SELECT ${COLUMNS.join(", ")} FROM observations`)
  .all() as Record<string, unknown>[];

if (rebuiltRows.length !== origRows.size)
  fail(`REBUILD_COUNT_MISMATCH:${rebuiltRows.length}!=${origRows.size}`);

for (const row of rebuiltRows) {
  const orig = origRows.get(row.id as string);
  if (!orig) fail(`REBUILD_UNKNOWN_ID:${row.id}`);
  for (const col of COLUMNS) {
    const a = orig[col];
    const b = row[col];
    // SQLite stores booleans as integers; obs_json/observed_at handled below.
    if (col === "value_bool") {
      const norm = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      if (norm(a) !== norm(b)) fail(`REBUILD_MISMATCH:${row.id}:${col}`);
      continue;
    }
    if (a !== b) fail(`REBUILD_MISMATCH:${row.id}:${col}:${String(a)}!=${String(b)}`);
  }
}

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "rebuild-receipt.json"), "utf8"),
) as { schema: string; rebuilt: number };
if (receipt.schema !== "hdri-independent-rebuild@1" || receipt.rebuilt !== origRows.size)
  fail("REBUILD_RECEIPT_INVALID");

rebuilt.close();
original.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/independent-rebuild/rebuilt.sqlite",
    "work/independent-rebuild/projection.jsonl",
    "work/independent-rebuild/rebuild-receipt.json",
  ]),
);
