/*
<MODULE_CONTRACT>
  <purpose>Production adapter: run the real liveness check path (checkBatch → checkSiteLiveness) over the corpus through the fixture transport boundary.</purpose>
  <non-goals><item>Does not contact the network — transport is replaced at the fetch boundary only.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: liveness producer over the deterministic corpus.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import { checkBatch } from "@syrokomskyi/business-crawler";
import {
  appendJsonl,
  fixtureFetch,
  loadFixtureManifest,
  openCorpus,
  parseAdapterArgs,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const corpus = openCorpus(args.fixtureRoot);

// Transport boundary substitution: the production liveness logic runs unchanged.
globalThis.fetch = fixtureFetch(corpus);

const stageDir = path.join(args.workRoot, args.stage);
const db = new Database(path.join(stageDir, "liveness.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE liveness_checks (
    domain TEXT PRIMARY KEY,
    is_live INTEGER NOT NULL,
    http_status INTEGER,
    final_url TEXT,
    redirect_count INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    error_code TEXT,
    checked_at TEXT NOT NULL
  ) WITHOUT ROWID;
`);

const sites = corpus
  .prepare("SELECT domain FROM sites ORDER BY seq")
  .all() as { domain: string }[];

const results = await checkBatch(
  sites.map((s) => s.domain),
  { concurrency: 8, timeoutMs: 5_000, retryCount: 1 },
);

const insert = db.prepare(
  "INSERT INTO liveness_checks(domain, is_live, http_status, final_url, redirect_count, latency_ms, error_code, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");
db.transaction(() => {
  for (const result of results) {
    insert.run(
      result.domain,
      result.isLive ? 1 : 0,
      result.httpStatus,
      result.finalUrl,
      result.redirectCount,
      Math.round(result.latencyMs),
      result.errorCode,
      manifest.frozenTime,
    );
  }
})();
// Deterministic projection: volatile latency is evidence, not selection.
for (const result of results)
  await appendJsonl(projection, {
    domain: result.domain,
    is_live: result.isLive,
    http_status: result.httpStatus,
    final_url: result.finalUrl,
    error_code: result.errorCode,
  });

const live = results.filter((r) => r.isLive).length;
await writeJsonAtomic(path.join(stageDir, "liveness-receipt.json"), {
  schema: "hdri-liveness@1",
  stage: args.stage,
  checked: results.length,
  live,
  dead: results.length - live,
  checkedAt: manifest.frozenTime,
});
db.close();
corpus.close();
