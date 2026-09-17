/*
<MODULE_CONTRACT>
  <purpose>Production adapter: rebuild the observations DB from the emit bundle alone (the durable artifact) and produce a rebuild manifest.</purpose>
  <non-goals><item>Does not compare — the verifier performs the independent byte/row comparison.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: independent-rebuild producer — emit bundle → rebuilt observations DB.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { readEmitManifest } from "@syrokomskyi/observatory-emit";
import { migrateObservatory } from "../../../db/migrate.js";
import {
  ackFault,
  appendJsonl,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);
const emitDir = scratchPath(args.workRoot, "work/translation/emit");

const emitManifest = await readEmitManifest(emitDir);
const db = new Database(path.join(stageDir, "rebuilt.sqlite"));
migrateObservatory(db);

const insert = db.prepare(
  `INSERT INTO observations(
    id, asset_id, signal_path, ontology_version,
    value_bool, value_num, value_str, value_json, value_type,
    observed_at, recorded_at, run_id, evidence_ref, extractor_version,
    confidence, status, obs_json, signature, signed_at, signing_key_id,
    collector_id, collection_status, period, crawl_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

type SignedRow = {
  observation_id: string;
  asset_id: string;
  signal_path: string;
  value_bool: boolean | null;
  value_num: number | null;
  value_str: string | null;
  value_json: string | null;
  value_type: string;
  observed_at: string;
  recorded_at: string;
  crawl_id: string;
  evidence_ref: string | null;
  collector_version: string;
  confidence: number;
  status: string;
  signature: string;
  signed_at: string;
  signing_key_id: string;
  collector_id: string;
  collection_status: string | null;
  crawl_hash: string | null;
};

let rebuilt = 0;
const projection = path.join(stageDir, "projection.jsonl");
const insertBatch = db.transaction((batch: SignedRow[]) => {
  for (const obs of batch) {
    insert.run(
      obs.observation_id,
      obs.asset_id,
      obs.signal_path,
      emitManifest.ontology_version,
      obs.value_bool === null ? null : obs.value_bool ? 1 : 0,
      obs.value_num,
      obs.value_str,
      obs.value_json,
      obs.value_type,
      obs.observed_at,
      obs.recorded_at,
      obs.crawl_id,
      obs.evidence_ref,
      obs.collector_version,
      obs.confidence,
      obs.status,
      JSON.stringify(obs),
      obs.signature,
      obs.signed_at,
      obs.signing_key_id,
      obs.collector_id,
      obs.collection_status,
      manifest.period,
      obs.crawl_hash,
    );
    void appendJsonl(projection, {
      observation_id: obs.observation_id,
      asset_id: obs.asset_id,
      signal_path: obs.signal_path,
    });
    rebuilt++;
  }
});

for (const part of emitManifest.observation_partitions) {
  const lines = fs
    .readFileSync(path.join(emitDir, part.uri), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as SignedRow);
  for (let i = 0; i < lines.length; i += 10_000) insertBatch(lines.slice(i, i + 10_000));
}

// Rebuilt DB committed — the public-promotion boundary is the deterministic failpoint.
if (args.faultBoundary === "public-promotion")
  await ackFault(args, "public-promotion", {
    rebuilt,
    promotionPending: true,
  });

await writeJsonAtomic(path.join(stageDir, "rebuild-receipt.json"), {
  schema: "hdri-independent-rebuild@1",
  stage: args.stage,
  source: "work/translation/emit",
  rebuilt,
  rebuiltAt: manifest.frozenTime,
});
db.close();
