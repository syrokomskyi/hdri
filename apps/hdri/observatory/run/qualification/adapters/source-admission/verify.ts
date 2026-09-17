/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for the source-admission stage: re-derives provisional identities and checks registry completeness against the fixture corpus.</purpose>
  <non-goals><item>Does not trust producer-side claims; every check reads the produced bytes.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: source-admission verifier.</item>
</CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
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
const db = new Database(scratchPath(args.workRoot, "work/source-admission/registry.sqlite"), {
  readonly: true,
});

const admitted = db
  .prepare(
    "SELECT domain, provisional_id, bundesland, destatis_group, admitted_at FROM admitted_sources ORDER BY domain",
  )
  .all() as {
  domain: string;
  provisional_id: string;
  bundesland: string;
  destatis_group: string;
  admitted_at: string;
}[];

const sites = corpus
  .prepare("SELECT seq, domain, bundesland, destatis_group FROM sites ORDER BY seq")
  .all() as { seq: number; domain: string; bundesland: string; destatis_group: string }[];

if (admitted.length !== sites.length || admitted.length !== args.targets)
  fail(`ADMISSION_COUNT_MISMATCH:${admitted.length}!=${sites.length}`);

// Independent re-derivation of the provisional id (same contract, own implementation).
const expectedId = (domain: string) =>
  `da-${createHash("sha256").update(`observatory:asset:${domain}`).digest("hex").slice(0, 32)}`;

const byDomain = new Map(admitted.map((row) => [row.domain, row]));
for (const site of sites) {
  const row = byDomain.get(site.domain);
  if (!row) fail(`ADMISSION_MISSING:${site.domain}`);
  if (row.provisional_id !== expectedId(site.domain))
    fail(`ADMISSION_ID_MISMATCH:${site.domain}`);
  if (row.bundesland !== site.bundesland || row.destatis_group !== site.destatis_group)
    fail(`ADMISSION_FIELD_MISMATCH:${site.domain}`);
}

// Projection must equal the registry rows in the same deterministic order.
const projection = fs
  .readFileSync(scratchPath(args.workRoot, "work/source-admission/projection.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { domain: string; provisional_id: string });
if (projection.length !== admitted.length) fail("PROJECTION_COUNT_MISMATCH");
const projIds = new Set(projection.map((row) => row.provisional_id));
for (const row of admitted) if (!projIds.has(row.provisional_id)) fail("PROJECTION_ROW_MISSING");

const receipt = JSON.parse(
  fs.readFileSync(scratchPath(args.workRoot, "work/source-admission/admission-receipt.json"), "utf8"),
) as { schema: string; admitted: number };
if (receipt.schema !== "hdri-source-admission@1" || receipt.admitted !== args.targets)
  fail("ADMISSION_RECEIPT_INVALID");

db.close();
corpus.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/source-admission/registry.sqlite",
    "work/source-admission/projection.jsonl",
    "work/source-admission/admission-receipt.json",
  ]),
);
