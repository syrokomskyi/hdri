/*
<MODULE_CONTRACT>
  <purpose>Production adapter: build the population frame and resolve canonical asset identities through the real planIdentityResolution core.</purpose>
  <non-goals><item>Does not mint operational identities — canonical ids here are deterministic fixture identities.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: frame-identity producer over admitted sources and the fixture frame.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import { planIdentityResolution } from "../../../mint/mint-core.js";
import {
  ackFault,
  appendJsonl,
  deterministicId,
  loadFixtureManifest,
  openCorpus,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const corpus = openCorpus(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);

const registry = new Database(scratchPath(args.workRoot, "work/source-admission/registry.sqlite"), {
  readonly: true,
});
const admitted = registry
  .prepare("SELECT domain, provisional_id, bundesland, destatis_group FROM admitted_sources")
  .all() as {
  domain: string;
  provisional_id: string;
  bundesland: string;
  destatis_group: string;
}[];
registry.close();

// Real identity-resolution decision: empty prior maps (fresh quarter), deterministic mint.
let mintCounter = 0;
const plan = planIdentityResolution({
  requests: admitted.map((row) => ({ provisionalId: row.provisional_id, domain: row.domain })),
  vaultRegistry: new Map(),
  localMap: new Map(),
  localDomain: new Map(),
  firstSeenPeriod: new Map(),
  briefPeriod: manifest.period,
  mintedAt: manifest.frozenTime,
  mint: () => deterministicId("canonical", `mint-${mintCounter++}`),
});

const db = new Database(path.join(stageDir, "identity.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE asset_id_map (
    provisional_id TEXT PRIMARY KEY,
    canonical_id TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    first_seen_period TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE frame_weights (
    bundesland TEXT NOT NULL,
    destatis_group TEXT NOT NULL,
    companies INTEGER NOT NULL,
    weight REAL NOT NULL,
    PRIMARY KEY (bundesland, destatis_group)
  ) WITHOUT ROWID;
`);

const cells = corpus
  .prepare(
    "SELECT bundesland, destatis_group, companies FROM frame_cells ORDER BY bundesland, destatis_group",
  )
  .all() as { bundesland: string; destatis_group: string; companies: number }[];
const totalCompanies = cells.reduce((sum, c) => sum + c.companies, 0);

const insertMap = db.prepare(
  "INSERT INTO asset_id_map(provisional_id, canonical_id, domain, first_seen_period) VALUES (?, ?, ?, ?)",
);
const insertCell = db.prepare(
  "INSERT INTO frame_weights(bundesland, destatis_group, companies, weight) VALUES (?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");

const writeIdentities = db.transaction((rows: typeof admitted) => {
  for (const row of rows) {
    const canonical = plan.resolved.get(row.provisional_id);
    if (!canonical) throw new Error(`IDENTITY_UNRESOLVED:${row.provisional_id}`);
    insertMap.run(row.provisional_id, canonical, row.domain, manifest.period);
    void appendJsonl(projection, {
      provisional_id: row.provisional_id,
      canonical_id: canonical,
      domain: row.domain,
    });
  }
});

const midpoint = Math.floor(admitted.length / 2);
writeIdentities(admitted.slice(0, midpoint));
if (args.faultBoundary === "event-transaction")
  await ackFault(args, "event-transaction", {
    resolvedIdentities: midpoint,
    pendingIdentities: admitted.length - midpoint,
  });
writeIdentities(admitted.slice(midpoint));

db.transaction(() => {
  for (const cell of cells)
    insertCell.run(
      cell.bundesland,
      cell.destatis_group,
      cell.companies,
      cell.companies / totalCompanies,
    );
})();

await writeJsonAtomic(path.join(stageDir, "identity-receipt.json"), {
  schema: "hdri-frame-identity@1",
  stage: args.stage,
  resolved: plan.resolved.size,
  minted: plan.minted,
  reused: plan.reused,
  backfilled: plan.backfilled,
  frameCells: cells.length,
});
db.close();
corpus.close();
