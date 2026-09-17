/*
<MODULE_CONTRACT>
  <purpose>Production adapter: run the real scientific QC reports (availability/attrition + reconcile-counts) over liveness and frame data.</purpose>
  <non-goals><item>Does not interpret results — reports are produced; the verifier checks their internal consistency.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: scientific-check producer.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
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

const frameDb = new Database(scratchPath(args.workRoot, "work/frame-identity/identity.sqlite"), {
  readonly: true,
});
const frame = frameDb
  .prepare("SELECT domain, canonical_id FROM asset_id_map ORDER BY domain")
  .all() as { domain: string; canonical_id: string }[];
frameDb.close();

const liveDb = new Database(scratchPath(args.workRoot, "work/liveness/liveness.sqlite"), {
  readonly: true,
});
const liveness = new Map(
  (
    liveDb.prepare("SELECT domain, is_live, http_status FROM liveness_checks").all() as {
      domain: string;
      is_live: number;
      http_status: number | null;
    }[]
  ).map((r) => [r.domain, r]),
);
liveDb.close();

const scoresDb = new Database(scratchPath(args.workRoot, "work/scoring/observations.sqlite"), {
  readonly: true,
});
const scored = new Set(
  (
    scoresDb
      .prepare("SELECT DISTINCT asset_id FROM scores WHERE run_id = ?")
      .all(manifest.runId) as { asset_id: string }[]
  ).map((r) => r.asset_id),
);
scoresDb.close();

// Capture count is part of the report cells — query it before building the report.
const captureDb = new Database(scratchPath(args.workRoot, "work/homepage-capture/capture.sqlite"), {
  readonly: true,
});
const capturedCount = (
  captureDb.prepare("SELECT COUNT(*) AS n FROM homepage_captures").get() as { n: number }
).n;
captureDb.close();

// Availability/attrition report — same computation as tools/scientific-reports/availability-report.ts.
const cells = { admitted: frame.length, live: 0, captured: capturedCount, scored: 0 };
const attrition: { domain: string; stage: string }[] = [];
for (const row of frame) {
  const live = liveness.get(row.domain);
  if (live?.is_live === 1) cells.live++;
  else attrition.push({ domain: row.domain, stage: "liveness" });
  if (scored.has(row.canonical_id)) cells.scored++;
  else if (live?.is_live === 1) attrition.push({ domain: row.domain, stage: "scoring" });
}
const report = {
  schema: "hdri-availability-report@1",
  period: manifest.period,
  runId: manifest.runId,
  cells,
  attritionRate: cells.admitted === 0 ? 0 : (cells.admitted - cells.scored) / cells.admitted,
  attrition,
  generatedAt: manifest.frozenTime,
};
await writeJsonAtomic(path.join(stageDir, "availability-report.json"), report);

// First report sealed — the scientific-report boundary is the deterministic failpoint.
if (args.faultBoundary === "scientific-report")
  await ackFault(args, "scientific-report", {
    reportsWritten: 1,
    reportsPending: 1,
  });

// Reconcile-counts: frame ↔ liveness ↔ capture ↔ score row counts must agree.
const reconcile = {
  schema: "hdri-reconcile-counts@1",
  period: manifest.period,
  counts: cells,
  consistent: cells.live === cells.captured && cells.captured === cells.scored,
  generatedAt: manifest.frozenTime,
};
await writeJsonAtomic(path.join(stageDir, "reconcile-counts.json"), reconcile);

const projection = path.join(stageDir, "projection.jsonl");
await appendJsonl(projection, { report: "availability", cells });
await appendJsonl(projection, { report: "reconcile", consistent: reconcile.consistent });

await writeJsonAtomic(path.join(stageDir, "scientific-receipt.json"), {
  schema: "hdri-scientific-check@1",
  stage: args.stage,
  reports: 2,
  consistent: reconcile.consistent,
  generatedAt: manifest.frozenTime,
});
