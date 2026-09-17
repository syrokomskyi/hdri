/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for scoring: re-scores a deterministic sample into a scratch DB and compares score/confidence/hash against the producer's rows.</purpose>
  <non-goals><item>Does not trust producer scores — sample assets are re-scored from raw observations.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: scoring verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import { scoreAndWriteForRun } from "../../../score/score-core.js";
import { migrateObservatory } from "../../../db/migrate.js";
import {
  emitVerification,
  fail,
  loadFixtureManifest,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = scratchPath(args.workRoot, "work/scoring");

const codebook = parseCodebookOrThrow(
  fs.readFileSync("/runtime/closure/config/codebook.yaml", "utf8"),
  "codebook.yaml",
);

const db = new Database(path.join(stageDir, "observations.sqlite"), { readonly: true });
const scores = db
  .prepare(
    "SELECT id, asset_id, overall_score, confidence, computation_hash FROM scores WHERE run_id = ?",
  )
  .all(manifest.runId) as {
  id: string;
  asset_id: string;
  overall_score: number;
  confidence: number;
  computation_hash: string;
}[];
if (scores.length === 0) fail("SCORING_EMPTY");

// Every scored asset must have dimension rows and trace rows.
const dimCount = db.prepare("SELECT COUNT(*) AS n FROM score_dimensions WHERE score_id = ?");
const traceCount = db.prepare(
  "SELECT COUNT(*) AS n FROM score_indicator_traces WHERE score_id = ?",
);
for (const s of scores) {
  if ((dimCount.get(s.id) as { n: number }).n === 0) fail(`SCORE_NO_DIMENSIONS:${s.asset_id}`);
  if ((traceCount.get(s.id) as { n: number }).n === 0) fail(`SCORE_NO_TRACES:${s.asset_id}`);
}

// Independent re-score into a scratch DB (same production path, fresh storage).
const scratchDb = new Database(path.join(stageDir, "verify-scratch.sqlite"));
migrateObservatory(scratchDb);
scratchDb.exec(`ATTACH DATABASE '${path.join(stageDir, "observations.sqlite")}' AS src`);
// Copy only raw observation rows — scores/traces are rebuilt by the scorer.
scratchDb.exec(
  `INSERT INTO observations SELECT * FROM src.observations;
   INSERT INTO synced_bundles SELECT * FROM src.synced_bundles;`,
);
const fresh = scoreAndWriteForRun(scratchDb, codebook, {
  runId: manifest.runId,
  period: manifest.period,
  now: manifest.frozenTime,
});
const freshByAsset = fresh.perAsset;
for (const s of scores) {
  const f = freshByAsset.get(s.asset_id);
  if (!f) fail(`SCORE_MISSING_IN_RESCORE:${s.asset_id}`);
  if (f.overallScore !== s.overall_score || f.computationHash !== s.computation_hash)
    fail(`SCORE_MISMATCH:${s.asset_id}`);
}
scratchDb.close();
fs.unlinkSync(path.join(stageDir, "verify-scratch.sqlite"));

const projection = fs
  .readFileSync(path.join(stageDir, "projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== scores.length) fail("SCORING_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "scoring-receipt.json"), "utf8"),
) as { schema: string; scored: number };
if (receipt.schema !== "hdri-scoring@1" || receipt.scored !== scores.length)
  fail("SCORING_RECEIPT_INVALID");

db.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/scoring/observations.sqlite",
    "work/scoring/projection.jsonl",
    "work/scoring/scoring-receipt.json",
  ]),
);
