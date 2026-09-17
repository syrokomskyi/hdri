/*
<MODULE_CONTRACT>
  <purpose>Production adapter: detect legal/contact pages from captured homepages via the real extractPageSignals path and capture them into the CAS.</purpose>
  <non-goals><item>Does not contact the network — transport is replaced at the fetch boundary only.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: detected-capture producer over captured homepages.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { extractPageSignals, fetchPageContent } from "@syrokomskyi/business-crawler";
import {
  ackFault,
  appendJsonl,
  casWrite,
  fixtureFetch,
  loadFixtureManifest,
  openCorpus,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const corpus = openCorpus(args.fixtureRoot);
globalThis.fetch = fixtureFetch(corpus);

const stageDir = path.join(args.workRoot, args.stage);
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");
const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures ORDER BY domain")
  .all() as { domain: string; cas_uri: string }[];
homeDb.close();

const db = new Database(path.join(stageDir, "detected.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE detected_pages (
    domain TEXT NOT NULL,
    kind TEXT NOT NULL,
    url TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    cas_uri TEXT NOT NULL,
    PRIMARY KEY (domain, kind)
  ) WITHOUT ROWID;
`);

const insert = db.prepare(
  "INSERT INTO detected_pages(domain, kind, url, content_hash, bytes, cas_uri) VALUES (?, ?, ?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");
const checkpointPath = path.join(stageDir, "checkpoint.json");
const midpoint = Math.floor(homes.length / 2);
let detected = 0;

const KINDS: { field: "impressumUrl" | "datenschutzUrl"; kind: string }[] = [
  { field: "impressumUrl", kind: "impressum" },
  { field: "datenschutzUrl", kind: "datenschutz" },
];

const process = async (domain: string, casUri: string): Promise<void> => {
  const html = fs.readFileSync(path.join(homeDir, casUri), "utf8");
  const signals = extractPageSignals(html, `https://${domain}/`);
  for (const { field, kind } of KINDS) {
    const link = signals[field];
    if (!link) continue;
    const result = await fetchPageContent(link, { timeoutMs: 10_000 });
    if (!result.ok || !result.html) throw new Error(`DETECTED_CAPTURE_FAILED:${domain}:${kind}`);
    const bytes = Buffer.from(result.html, "utf8");
    const cas = await casWrite(stageDir, bytes);
    insert.run(domain, kind, link, cas.sha256, bytes.length, cas.uri);
    detected++;
    await appendJsonl(projection, { domain, kind, content_hash: cas.sha256 });
  }
};

for (const [i, home] of homes.entries()) {
  await process(home.domain, home.cas_uri);
  // Real extraction checkpoint: sealed progress record every midpoint.
  if (i === midpoint - 1) {
    await writeJsonAtomic(checkpointPath, {
      schema: "hdri-extraction-checkpoint@1",
      stage: args.stage,
      processed: i + 1,
      detected,
    });
    if (args.faultBoundary === "extraction-checkpoint")
      await ackFault(args, "extraction-checkpoint", {
        checkpointed: i + 1,
        pending: homes.length - (i + 1),
      });
  }
}
if (!fs.existsSync(checkpointPath))
  await writeJsonAtomic(checkpointPath, {
    schema: "hdri-extraction-checkpoint@1",
    stage: args.stage,
    processed: homes.length,
    detected,
  });

await writeJsonAtomic(path.join(stageDir, "detected-receipt.json"), {
  schema: "hdri-detected-capture@1",
  stage: args.stage,
  homepages: homes.length,
  detected,
  capturedAt: manifest.frozenTime,
});
db.close();
corpus.close();
