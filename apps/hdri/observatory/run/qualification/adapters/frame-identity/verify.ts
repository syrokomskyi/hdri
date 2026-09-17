/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for frame-identity: checks bijective provisional→canonical mapping, frame-weight normalization and projection consistency.</purpose>
  <non-goals><item>Does not re-run the planner — it validates the produced mapping against independent invariants.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: frame-identity verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import Database from "better-sqlite3";
import {
  emitVerification,
  fail,
  openCorpus,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const corpus = openCorpus(args.fixtureRoot);
const db = new Database(scratchPath(args.workRoot, "work/frame-identity/identity.sqlite"), {
  readonly: true,
});

const maps = db
  .prepare("SELECT provisional_id, canonical_id, domain, first_seen_period FROM asset_id_map")
  .all() as {
  provisional_id: string;
  canonical_id: string;
  domain: string;
  first_seen_period: string;
}[];
if (maps.length !== args.targets) fail(`IDENTITY_COUNT_MISMATCH:${maps.length}`);

// Bijection: provisional ids unique (PK), canonical ids unique, domains unique.
const canonicals = new Set(maps.map((r) => r.canonical_id));
const domains = new Set(maps.map((r) => r.domain));
if (canonicals.size !== maps.length || domains.size !== maps.length) fail("IDENTITY_NOT_BIJECTIVE");
for (const row of maps)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.canonical_id))
    fail(`IDENTITY_CANONICAL_SHAPE:${row.canonical_id}`);

// Registry join: every admitted provisional id is mapped exactly once.
const registry = new Database(scratchPath(args.workRoot, "work/source-admission/registry.sqlite"), {
  readonly: true,
});
const unmapped = registry.prepare("SELECT provisional_id FROM admitted_sources").all() as {
  provisional_id: string;
}[];
const mappedSet = new Set(maps.map((r) => r.provisional_id));
for (const row of unmapped)
  if (!mappedSet.has(row.provisional_id)) fail(`IDENTITY_UNMAPPED:${row.provisional_id}`);
registry.close();

// Frame weights: complete cells, normalized to 1.
const cells = db
  .prepare("SELECT bundesland, destatis_group, companies, weight FROM frame_weights")
  .all() as { bundesland: string; destatis_group: string; companies: number; weight: number }[];
const corpusCells = corpus
  .prepare("SELECT COUNT(*) AS n, SUM(companies) AS total FROM frame_cells")
  .get() as { n: number; total: number };
if (cells.length !== corpusCells.n) fail("FRAME_CELLS_MISMATCH");
const weightSum = cells.reduce((sum, c) => sum + c.weight, 0);
if (Math.abs(weightSum - 1) > 1e-9) fail(`FRAME_WEIGHT_NOT_NORMALIZED:${weightSum}`);
for (const cell of cells)
  if (Math.abs(cell.weight - cell.companies / corpusCells.total) > 1e-12)
    fail(`FRAME_WEIGHT_MISMATCH:${cell.bundesland}/${cell.destatis_group}`);

// Projection consistency.
const projection = fs
  .readFileSync(scratchPath(args.workRoot, "work/frame-identity/projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== maps.length) fail("IDENTITY_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(scratchPath(args.workRoot, "work/frame-identity/identity-receipt.json"), "utf8"),
) as { schema: string; resolved: number; minted: number };
if (receipt.schema !== "hdri-frame-identity@1" || receipt.resolved !== args.targets)
  fail("IDENTITY_RECEIPT_INVALID");

db.close();
corpus.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/frame-identity/identity.sqlite",
    "work/frame-identity/projection.jsonl",
    "work/frame-identity/identity-receipt.json",
  ]),
);
