/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for translation: re-verifies every signature, checks ontology conformance, emit-bundle integrity and DB↔bundle parity.</purpose>
  <non-goals><item>Does not trust producer receipts — signatures are re-verified against the fixture public key.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: translation verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { readOntologyFile } from "@syrokomskyi/observatory-core";
import { verifySignedObservation } from "@syrokomskyi/observatory-crypto";
import { readEmitManifest } from "@syrokomskyi/observatory-emit";
import {
  emitVerification,
  fail,
  loadFixtureManifest,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
  sha256Hex,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = scratchPath(args.workRoot, "work/translation");
const ontology = await readOntologyFile("/runtime/closure/config/ontology.yaml");

const db = new Database(path.join(stageDir, "observations.sqlite"), { readonly: true });
const dbRows = db
  .prepare(
    "SELECT id, asset_id, signal_path, value_type, signature, signing_key_id, collector_id, obs_json FROM observations",
  )
  .all() as {
  id: string;
  asset_id: string;
  signal_path: string;
  value_type: string;
  signature: string | null;
  signing_key_id: string | null;
  collector_id: string | null;
  obs_json: string | null;
}[];
if (dbRows.length === 0) fail("TRANSLATION_EMPTY");

// 1. Ontology conformance + signature re-verification on stored obs_json.
for (const row of dbRows) {
  if (!ontology.signals[row.signal_path]) fail(`TRANSLATION_UNKNOWN_SIGNAL:${row.signal_path}`);
  if (!row.obs_json) fail(`TRANSLATION_NO_OBS_JSON:${row.id}`);
  const signed = JSON.parse(row.obs_json) as Parameters<typeof verifySignedObservation>[0];
  if (signed.observation_id !== row.id) fail(`TRANSLATION_ID_MISMATCH:${row.id}`);
  if (signed.signing_key_id !== manifest.signingKey.signingKeyId)
    fail(`TRANSLATION_WRONG_KEY:${row.id}`);
  if (
    !verifySignedObservation(signed, {
      signingKeyId: manifest.signingKey.signingKeyId,
      publicKeyPem: manifest.signingKey.publicKeyPem,
    })
  )
    fail(`TRANSLATION_BAD_SIGNATURE:${row.id}`);
}

// 2. Emit bundle integrity: manifest hashes match partition bytes, rows parse.
const emitDir = path.join(stageDir, "emit");
const emitManifest = await readEmitManifest(emitDir);
if (emitManifest.run_id !== manifest.runId || emitManifest.period !== manifest.period)
  fail("TRANSLATION_EMIT_MANIFEST_MISMATCH");
let emitted = 0;
const emittedIds = new Set<string>();
for (const part of emitManifest.observation_partitions) {
  const bytes = fs.readFileSync(path.join(emitDir, part.uri));
  if (sha256Hex(bytes) !== part.sha256) fail(`EMIT_PARTITION_HASH:${part.uri}`);
  for (const line of bytes.toString("utf8").trim().split("\n")) {
    const obs = JSON.parse(line) as { observation_id: string };
    emittedIds.add(obs.observation_id);
    emitted++;
  }
}
if (emitted !== emitManifest.observation_count) fail("EMIT_COUNT_MISMATCH");

// 3. DB↔bundle parity: identical observation-id sets.
for (const row of dbRows) if (!emittedIds.has(row.id)) fail(`EMIT_MISSING_OBSERVATION:${row.id}`);
if (emittedIds.size !== dbRows.length) fail("EMIT_DB_PARITY_MISMATCH");

// 4. Deterministic projection count.
const projection = fs
  .readFileSync(path.join(stageDir, "projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== dbRows.length) fail("TRANSLATION_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "translation-receipt.json"), "utf8"),
) as { schema: string; observations: number };
if (receipt.schema !== "hdri-translation@1" || receipt.observations !== dbRows.length)
  fail("TRANSLATION_RECEIPT_INVALID");

db.close();
// Emit partitions are byte-bound by manifest.json partition hashes (checked
// above), so the declared output set stays static for the profile contract.
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/translation/observations.sqlite",
    "work/translation/projection.jsonl",
    "work/translation/translation-receipt.json",
    "work/translation/emit/manifest.json",
  ]),
);
