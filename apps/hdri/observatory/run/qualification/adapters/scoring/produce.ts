/*
<MODULE_CONTRACT>
  <purpose>Production adapter: score every asset through the real scoreAndWriteForRun path with the frozen codebook.</purpose>
  <non-goals><item>Does not re-derive signals — consumes the translation observations DB as-is.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: scoring producer over translated observations.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import { scoreAndWriteForRun } from "../../../score/score-core.js";
import {
  appendJsonl,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);

const codebook = parseCodebookOrThrow(
  fs.readFileSync("/runtime/closure/config/codebook.yaml", "utf8"),
  "codebook.yaml",
);

// Score in-place over a copy of the translation DB so the upstream artifact stays pristine.
const srcDb = scratchPath(args.workRoot, "work/translation/observations.sqlite");
const workDb = path.join(stageDir, "observations.sqlite");
fs.copyFileSync(srcDb, workDb);
const db = new Database(workDb);

const summary = scoreAndWriteForRun(db, codebook, {
  runId: manifest.runId,
  period: manifest.period,
  now: manifest.frozenTime,
});

const projection = path.join(stageDir, "projection.jsonl");
for (const [assetId, score] of [...summary.perAsset.entries()].sort())
  await appendJsonl(projection, {
    asset_id: assetId,
    overall_score: score.overallScore,
    confidence: score.confidence,
    computation_hash: score.computationHash,
  });

await writeJsonAtomic(path.join(stageDir, "scoring-receipt.json"), {
  schema: "hdri-scoring@1",
  stage: args.stage,
  scored: summary.scored,
  skipped: summary.skipped,
  total: summary.total,
  codebookId: codebook.id,
  codebookVersion: codebook.version,
  scoredAt: manifest.frozenTime,
});
db.close();
