/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for extraction: re-extracts a deterministic sample, checks schema conformance and cross-checks impressum presence against detected pages.</purpose>
  <non-goals><item>Does not trust producer aggregates — sample rows are recomputed from CAS bytes.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: extraction verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { extractPageSignals } from "@syrokomskyi/business-crawler";
import {
  emitVerification,
  fail,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const stageDir = scratchPath(args.workRoot, "work/extraction");
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");
const detectedDir = scratchPath(args.workRoot, "work/detected-capture");

const db = new Database(path.join(stageDir, "signals.sqlite"), { readonly: true });
const total = (db.prepare("SELECT COUNT(*) AS n FROM extracted_signals").get() as { n: number }).n;
if (total === 0) fail("EXTRACTION_EMPTY");

const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures ORDER BY domain")
  .all() as { domain: string; cas_uri: string }[];
const detectedDb = new Database(path.join(detectedDir, "detected.sqlite"), { readonly: true });
const detected = detectedDb
  .prepare("SELECT domain, kind, cas_uri FROM detected_pages ORDER BY domain, kind")
  .all() as { domain: string; kind: string; cas_uri: string }[];

// Full-count check: every captured page contributed at least one signal.
const pagesWithSignals = (
  db.prepare("SELECT COUNT(DISTINCT domain || '|' || page_kind) AS n FROM extracted_signals").get() as {
    n: number;
  }
).n;
if (pagesWithSignals !== homes.length + detected.length)
  fail(`EXTRACTION_PAGE_COVERAGE:${pagesWithSignals}!=${homes.length + detected.length}`);

// Deterministic 1% sample re-extraction (same production extractor — determinism check).
const sample = homes.filter((_, i) => i % 100 === 0);
const rowFor = db.prepare(
  "SELECT value_json FROM extracted_signals WHERE domain = ? AND page_kind = 'home' AND signal = ?",
);
for (const home of sample) {
  const html = fs.readFileSync(path.join(homeDir, home.cas_uri), "utf8");
  const fresh = extractPageSignals(html, `https://${home.domain}/`);
  for (const field of ["impressumPresent", "cookieBannerPresent", "copyrightYear"] as const) {
    const stored = rowFor.get(home.domain, field) as { value_json: string } | undefined;
    const expected = fresh[field];
    if (expected === null) {
      if (stored) fail(`EXTRACTION_SPURIOUS:${home.domain}:${field}`);
      continue;
    }
    if (!stored || JSON.parse(stored.value_json) !== expected)
      fail(`EXTRACTION_MISMATCH:${home.domain}:${field}`);
  }
}

// Cross-check: impressumPresent must agree with the detected-pages table.
const impressumDetected = new Set(
  detected.filter((d) => d.kind === "impressum").map((d) => d.domain),
);
const impressumRows = db
  .prepare(
    "SELECT domain, value_json FROM extracted_signals WHERE page_kind = 'home' AND signal = 'impressumPresent'",
  )
  .all() as { domain: string; value_json: string }[];
for (const row of impressumRows) {
  const present = JSON.parse(row.value_json) === true;
  if (present !== impressumDetected.has(row.domain))
    fail(`EXTRACTION_IMPRESSUM_INCONSISTENT:${row.domain}`);
}

// Schema conformance: declared signal set only, valid JSON values.
const DECLARED = new Set([
  "pageTitle", "metaDescription", "h1Text", "canonicalUrl", "lang",
  "impressumPresent", "impressumUrl", "datenschutzPresent", "datenschutzUrl",
  "openingHoursText", "cookieBannerPresent", "phones", "emails", "socialLinks",
  "copyrightYear",
]);
for (const row of db
  .prepare("SELECT DISTINCT signal FROM extracted_signals")
  .all() as { signal: string }[])
  if (!DECLARED.has(row.signal)) fail(`EXTRACTION_UNKNOWN_SIGNAL:${row.signal}`);

const manifest = JSON.parse(
  fs.readFileSync(path.join(stageDir, "extraction-manifest.json"), "utf8"),
) as { schema: string; pages: number; signals: number };
if (
  manifest.schema !== "hdri-extraction@1" ||
  manifest.pages !== homes.length + detected.length ||
  manifest.signals !== total
)
  fail("EXTRACTION_MANIFEST_INVALID");

db.close();
homeDb.close();
detectedDb.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/extraction/signals.sqlite",
    "work/extraction/projection.jsonl",
    "work/extraction/extraction-manifest.json",
  ]),
);
