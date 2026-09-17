/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for homepage-capture: re-hashes every CAS object and checks manifest↔CAS↔corpus byte equality plus completeness.</purpose>
  <non-goals><item>Does not trust manifest hashes — every CAS file is re-read and re-hashed.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: homepage-capture verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  emitVerification,
  fail,
  openCorpus,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
  sha256Hex,
} from "../common.js";

const args = parseAdapterArgs();
const corpus = openCorpus(args.fixtureRoot);
const stageDir = scratchPath(args.workRoot, "work/homepage-capture");
const db = new Database(path.join(stageDir, "capture.sqlite"), { readonly: true });

const rows = db
  .prepare(
    "SELECT domain, url, content_hash, bytes, cas_uri, complete FROM homepage_captures",
  )
  .all() as {
  domain: string;
  url: string;
  content_hash: string;
  bytes: number;
  cas_uri: string;
  complete: number;
}[];

const liveSites = corpus
  .prepare("SELECT seq, domain FROM sites WHERE live = 1")
  .all() as { seq: number; domain: string }[];
if (rows.length !== liveSites.length)
  fail(`CAPTURE_COUNT_MISMATCH:${rows.length}!=${liveSites.length}`);

const pageBySite = corpus.prepare("SELECT html FROM pages WHERE site_seq = ? AND kind = 'home'");
const seen = new Set<string>();
for (const site of liveSites) {
  const row = rows.find((r) => r.domain === site.domain);
  if (!row) fail(`CAPTURE_MISSING:${site.domain}`);
  seen.add(row.cas_uri);
  const casFile = path.join(stageDir, row.cas_uri);
  if (!fs.existsSync(casFile)) fail(`CAS_MISSING:${row.cas_uri}`);
  const casBytes = fs.readFileSync(casFile);
  if (sha256Hex(casBytes) !== row.content_hash) fail(`CAS_HASH_MISMATCH:${site.domain}`);
  if (casBytes.length !== row.bytes) fail(`CAS_BYTES_MISMATCH:${site.domain}`);
  const truth = pageBySite.get(site.seq) as { html: Buffer } | undefined;
  if (!truth || !casBytes.equals(truth.html)) fail(`CAS_CONTENT_MISMATCH:${site.domain}`);
  if (row.complete !== 1) fail(`CAPTURE_INCOMPLETE:${site.domain}`);
}
if (seen.size !== rows.length) fail("CAS_URI_COLLISION");

const projection = fs
  .readFileSync(path.join(stageDir, "projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== rows.length) fail("CAPTURE_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "capture-receipt.json"), "utf8"),
) as { schema: string; captured: number; casWrites: number };
if (receipt.schema !== "hdri-homepage-capture@1" || receipt.captured !== liveSites.length)
  fail("CAPTURE_RECEIPT_INVALID");

db.close();
corpus.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/homepage-capture/capture.sqlite",
    "work/homepage-capture/projection.jsonl",
    "work/homepage-capture/capture-receipt.json",
  ]),
);
