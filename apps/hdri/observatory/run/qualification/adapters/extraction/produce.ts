/*
<MODULE_CONTRACT>
  <purpose>Production adapter: run the real extractPageSignals path over every captured page and persist per-signal rows plus a coverage manifest.</purpose>
  <non-goals><item>Does not interpret signals — extraction only; ontology mapping happens in translation.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: extraction producer over captured CAS pages.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { extractPageSignals } from "@syrokomskyi/business-crawler";
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
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");
const detectedDir = scratchPath(args.workRoot, "work/detected-capture");

const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures ORDER BY domain")
  .all() as { domain: string; cas_uri: string }[];
homeDb.close();
const detectedDb = new Database(path.join(detectedDir, "detected.sqlite"), { readonly: true });
const detected = detectedDb
  .prepare("SELECT domain, kind, cas_uri FROM detected_pages ORDER BY domain, kind")
  .all() as { domain: string; kind: string; cas_uri: string }[];
detectedDb.close();

const db = new Database(path.join(stageDir, "signals.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE extracted_signals (
    domain TEXT NOT NULL,
    page_kind TEXT NOT NULL,
    signal TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (domain, page_kind, signal)
  ) WITHOUT ROWID;
`);
const insert = db.prepare(
  "INSERT INTO extracted_signals(domain, page_kind, signal, value_json) VALUES (?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");

const SIGNAL_FIELDS = [
  "pageTitle",
  "metaDescription",
  "h1Text",
  "canonicalUrl",
  "lang",
  "impressumPresent",
  "impressumUrl",
  "datenschutzPresent",
  "datenschutzUrl",
  "openingHoursText",
  "cookieBannerPresent",
  "phones",
  "emails",
  "socialLinks",
  "copyrightYear",
] as const;

const extractPage = (domain: string, kind: string, html: string): number => {
  const result = extractPageSignals(html, `https://${domain}/`);
  let count = 0;
  for (const field of SIGNAL_FIELDS) {
    const value = result[field];
    if (value === null || (Array.isArray(value) && value.length === 0)) continue;
    const json = JSON.stringify(value);
    insert.run(domain, kind, field, json);
    void appendJsonl(projection, { domain, page_kind: kind, signal: field, value });
    count++;
  }
  return count;
};

let signalCount = 0;
const pages: { domain: string; kind: string; dir: string; cas: string }[] = [
  ...homes.map((h) => ({ domain: h.domain, kind: "home", dir: homeDir, cas: h.cas_uri })),
  ...detected.map((d) => ({ domain: d.domain, kind: d.kind, dir: detectedDir, cas: d.cas_uri })),
];
const midpoint = Math.floor(pages.length / 2);
const checkpointPath = path.join(stageDir, "checkpoint.json");

for (const [i, page] of pages.entries()) {
  const html = fs.readFileSync(path.join(page.dir, page.cas), "utf8");
  signalCount += extractPage(page.domain, page.kind, html);
  if (i === midpoint - 1) {
    await writeJsonAtomic(checkpointPath, {
      schema: "hdri-extraction-checkpoint@1",
      stage: args.stage,
      processed: i + 1,
      signals: signalCount,
    });
    if (args.faultBoundary === "extraction-checkpoint")
      await ackFault(args, "extraction-checkpoint", {
        checkpointed: i + 1,
        pending: pages.length - (i + 1),
      });
  }
}
if (!fs.existsSync(checkpointPath))
  await writeJsonAtomic(checkpointPath, {
    schema: "hdri-extraction-checkpoint@1",
    stage: args.stage,
    processed: pages.length,
    signals: signalCount,
  });

const coverage = db
  .prepare(
    "SELECT signal, COUNT(*) AS n FROM extracted_signals GROUP BY signal ORDER BY signal",
  )
  .all() as { signal: string; n: number }[];
await writeJsonAtomic(path.join(stageDir, "extraction-manifest.json"), {
  schema: "hdri-extraction@1",
  stage: args.stage,
  pages: pages.length,
  signals: signalCount,
  fieldCoverage: Object.fromEntries(coverage.map((c) => [c.signal, c.n])),
  extractedAt: manifest.frozenTime,
});
db.close();
