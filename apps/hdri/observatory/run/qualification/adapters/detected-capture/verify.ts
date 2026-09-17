/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for detected-capture: re-detects legal links with an independent regex pass and checks every detected page against corpus bytes.</purpose>
  <non-goals><item>Does not reuse the producer's extractor — link expectations come from an independent scan.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: detected-capture verifier.</item>
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
const stageDir = scratchPath(args.workRoot, "work/detected-capture");
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");

const db = new Database(path.join(stageDir, "detected.sqlite"), { readonly: true });
const rows = db
  .prepare("SELECT domain, kind, url, content_hash, bytes, cas_uri FROM detected_pages")
  .all() as {
  domain: string;
  kind: string;
  url: string;
  content_hash: string;
  bytes: number;
  cas_uri: string;
}[];
const detected = new Map(rows.map((r) => [`${r.domain}:${r.kind}`, r]));

const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures")
  .all() as { domain: string; cas_uri: string }[];
homeDb.close();

const siteSeq = new Map(
  (corpus.prepare("SELECT seq, domain FROM sites").all() as { seq: number; domain: string }[]).map(
    (s) => [s.domain, s.seq],
  ),
);
const pageBySite = corpus.prepare("SELECT html FROM pages WHERE site_seq = ? AND kind = ?");

// Independent link detection: plain regex over the CAS bytes, not the producer extractor.
const LINK_RE = /href="\/(impressum|datenschutz)\/?"/gi;
for (const home of homes) {
  const html = fs.readFileSync(path.join(homeDir, home.cas_uri), "utf8");
  const expected = new Set([...html.matchAll(LINK_RE)].map((m) => m[1]!.toLowerCase()));
  for (const kind of expected) {
    const row = detected.get(`${home.domain}:${kind}`);
    if (!row) fail(`DETECTED_MISSING:${home.domain}:${kind}`);
    const casBytes = fs.readFileSync(path.join(stageDir, row.cas_uri));
    if (sha256Hex(casBytes) !== row.content_hash) fail(`DETECTED_HASH_MISMATCH:${home.domain}`);
    const truth = pageBySite.get(siteSeq.get(home.domain), kind) as { html: Buffer } | undefined;
    if (!truth || !casBytes.equals(truth.html))
      fail(`DETECTED_CONTENT_MISMATCH:${home.domain}:${kind}`);
  }
}

const projection = fs
  .readFileSync(path.join(stageDir, "projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== rows.length) fail("DETECTED_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "detected-receipt.json"), "utf8"),
) as { schema: string; detected: number };
if (receipt.schema !== "hdri-detected-capture@1" || receipt.detected !== rows.length)
  fail("DETECTED_RECEIPT_INVALID");

db.close();
corpus.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/detected-capture/detected.sqlite",
    "work/detected-capture/projection.jsonl",
    "work/detected-capture/detected-receipt.json",
  ]),
);
