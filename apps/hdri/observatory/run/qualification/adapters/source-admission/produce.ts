/*
<MODULE_CONTRACT>
  <purpose>Production adapter: admit fixture source records through the real domain-normalization and provisional-identity path into a registry database.</purpose>
  <non-goals><item>Does not grant operational admission — this is the rehearsal source stage.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: source-admission producer over the deterministic corpus.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import { normaliseDomainOrThrow } from "@syrokomskyi/business-core";
import { deriveAssetId } from "@syrokomskyi/observatory-core";
import {
  ackFault,
  appendJsonl,
  loadFixtureManifest,
  openCorpus,
  parseAdapterArgs,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
if (manifest.targets !== args.targets) throw new Error("FIXTURE_TARGETS_MISMATCH");
const corpus = openCorpus(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);
const dbPath = path.join(stageDir, "registry.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE admitted_sources (
    domain TEXT PRIMARY KEY,
    provisional_id TEXT NOT NULL,
    bundesland TEXT NOT NULL,
    destatis_group TEXT NOT NULL,
    admitted_at TEXT NOT NULL,
    source_hash TEXT NOT NULL
  ) WITHOUT ROWID;
`);

const sites = corpus
  .prepare(
    "SELECT seq, domain, bundesland, destatis_group FROM sites ORDER BY seq",
  )
  .all() as { seq: number; domain: string; bundesland: string; destatis_group: string }[];

const insert = db.prepare(
  "INSERT INTO admitted_sources(domain, provisional_id, bundesland, destatis_group, admitted_at, source_hash) VALUES (?, ?, ?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");
const midpoint = Math.floor(sites.length / 2);

const admit = db.transaction(
  (rows: typeof sites, offset: number) => {
    for (const [i, site] of rows.entries()) {
      const normalised = normaliseDomainOrThrow(site.domain);
      insert.run(
        normalised,
        deriveAssetId(normalised),
        site.bundesland,
        site.destatis_group,
        manifest.frozenTime,
        args.consumedSha256,
      );
      void appendJsonl(projection, {
        domain: normalised,
        provisional_id: deriveAssetId(normalised),
        bundesland: site.bundesland,
        destatis_group: site.destatis_group,
      });
      void i;
    }
  },
);

// Commit in two transactions so the event-transaction boundary is real work.
admit(sites.slice(0, midpoint), 0);
if (args.faultBoundary === "event-transaction")
  await ackFault(args, "event-transaction", {
    committedRows: midpoint,
    pendingRows: sites.length - midpoint,
  });
admit(sites.slice(midpoint), midpoint);

await writeJsonAtomic(path.join(stageDir, "admission-receipt.json"), {
  schema: "hdri-source-admission@1",
  stage: args.stage,
  admitted: sites.length,
  rejected: 0,
  admittedAt: manifest.frozenTime,
});
db.close();
corpus.close();
