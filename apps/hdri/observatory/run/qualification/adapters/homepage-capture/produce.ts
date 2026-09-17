/*
<MODULE_CONTRACT>
  <purpose>Production adapter: capture live homepages through the real fetchPageContent path into a content-addressed store plus a capture manifest.</purpose>
  <non-goals><item>Does not contact the network — transport is replaced at the fetch boundary only.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: homepage-capture producer over the deterministic corpus.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import { fetchPageContent } from "@syrokomskyi/business-crawler";
import {
  ackFault,
  appendJsonl,
  casWrite,
  fixtureFetch,
  loadFixtureManifest,
  openCorpus,
  parseAdapterArgs,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const corpus = openCorpus(args.fixtureRoot);
globalThis.fetch = fixtureFetch(corpus);

const stageDir = path.join(args.workRoot, args.stage);
const db = new Database(path.join(stageDir, "capture.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE homepage_captures (
    domain TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    final_url TEXT,
    content_hash TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    cas_uri TEXT NOT NULL,
    complete INTEGER NOT NULL,
    captured_at TEXT NOT NULL
  ) WITHOUT ROWID;
`);

const live = corpus.prepare("SELECT domain FROM sites WHERE live = 1 ORDER BY seq").all() as {
  domain: string;
}[];

const insert = db.prepare(
  "INSERT INTO homepage_captures(domain, url, final_url, content_hash, bytes, cas_uri, complete, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");
const midpoint = Math.floor(live.length / 2);
let casWrites = 0;

const capture = async (domain: string): Promise<void> => {
  const url = `https://${domain}/`;
  const result = await fetchPageContent(url, { timeoutMs: 10_000 });
  if (!result.ok || !result.html)
    throw new Error(`CAPTURE_FAILED:${domain}:${result.ok ? "" : result.errorCode}`);
  const bytes = Buffer.from(result.html, "utf8");
  const cas = await casWrite(stageDir, bytes);
  casWrites++;
  insert.run(
    domain,
    url,
    result.finalUrl ?? url,
    cas.sha256,
    bytes.length,
    cas.uri,
    result.complete ? 1 : 0,
    manifest.frozenTime,
  );
  await appendJsonl(projection, {
    domain,
    content_hash: cas.sha256,
    bytes: bytes.length,
    complete: result.complete,
  });
};

// Commit CAS writes in two batches so the cas-write boundary is real work.
for (const site of live.slice(0, midpoint)) await capture(site.domain);
db.transaction(() => {})(); // flush boundary marker
if (args.faultBoundary === "cas-write")
  await ackFault(args, "cas-write", { casWrites, pending: live.length - midpoint });
for (const site of live.slice(midpoint)) await capture(site.domain);

await writeJsonAtomic(path.join(stageDir, "capture-receipt.json"), {
  schema: "hdri-homepage-capture@1",
  stage: args.stage,
  captured: live.length,
  casWrites,
  capturedAt: manifest.frozenTime,
});
db.close();
corpus.close();
