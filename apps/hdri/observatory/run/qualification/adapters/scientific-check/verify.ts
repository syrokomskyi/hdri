/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for scientific-check: recomputes availability cells and reconcile counts from upstream DBs and compares against the reports.</purpose>
  <non-goals><item>Does not trust report contents — every cell is recomputed from source tables.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: scientific-check verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  emitVerification,
  fail,
  loadFixtureManifest,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = scratchPath(args.workRoot, "work/scientific-check");

const frameDb = new Database(scratchPath(args.workRoot, "work/frame-identity/identity.sqlite"), {
  readonly: true,
});
const frame = frameDb.prepare("SELECT domain, canonical_id FROM asset_id_map").all() as {
  domain: string;
  canonical_id: string;
}[];
frameDb.close();

const liveDb = new Database(scratchPath(args.workRoot, "work/liveness/liveness.sqlite"), {
  readonly: true,
});
const liveCount = (
  liveDb.prepare("SELECT COUNT(*) AS n FROM liveness_checks WHERE is_live = 1").get() as {
    n: number;
  }
).n;
liveDb.close();

const captureDb = new Database(scratchPath(args.workRoot, "work/homepage-capture/capture.sqlite"), {
  readonly: true,
});
const captured = (
  captureDb.prepare("SELECT COUNT(*) AS n FROM homepage_captures").get() as { n: number }
).n;
captureDb.close();

const scoresDb = new Database(scratchPath(args.workRoot, "work/scoring/observations.sqlite"), {
  readonly: true,
});
const scored = (
  scoresDb
    .prepare("SELECT COUNT(DISTINCT asset_id) AS n FROM scores WHERE run_id = ?")
    .get(manifest.runId) as { n: number }
).n;
scoresDb.close();

const report = JSON.parse(
  fs.readFileSync(path.join(stageDir, "availability-report.json"), "utf8"),
) as {
  schema: string;
  cells: { admitted: number; live: number; captured: number; scored: number };
  attrition: { domain: string; stage: string }[];
};
if (report.schema !== "hdri-availability-report@1") fail("AVAILABILITY_SCHEMA");
if (report.cells.admitted !== frame.length) fail("AVAILABILITY_ADMITTED_MISMATCH");
if (report.cells.live !== liveCount) fail("AVAILABILITY_LIVE_MISMATCH");
if (report.cells.captured !== captured) fail("AVAILABILITY_CAPTURED_MISMATCH");
if (report.cells.scored !== scored) fail("AVAILABILITY_SCORED_MISMATCH");

const reconcile = JSON.parse(
  fs.readFileSync(path.join(stageDir, "reconcile-counts.json"), "utf8"),
) as {
  schema: string;
  consistent: boolean;
  counts: { live: number; captured: number; scored: number };
};
if (reconcile.schema !== "hdri-reconcile-counts@1") fail("RECONCILE_SCHEMA");
if (reconcile.counts.live !== liveCount || reconcile.counts.captured !== captured)
  fail("RECONCILE_COUNTS_MISMATCH");
if (!reconcile.consistent) fail("RECONCILE_INCONSISTENT");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "scientific-receipt.json"), "utf8"),
) as { schema: string; consistent: boolean };
if (receipt.schema !== "hdri-scientific-check@1" || !receipt.consistent)
  fail("SCIENTIFIC_RECEIPT_INVALID");

emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/scientific-check/availability-report.json",
    "work/scientific-check/reconcile-counts.json",
    "work/scientific-check/projection.jsonl",
    "work/scientific-check/scientific-receipt.json",
  ]),
);
