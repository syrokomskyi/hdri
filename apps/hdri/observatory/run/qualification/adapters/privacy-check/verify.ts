/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for privacy-check: recomputes strata from scores and checks the gate report against the k-anonymity rule.</purpose>
  <non-goals><item>Does not trust the report — strata counts and suppression flags are recomputed.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: privacy-check verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_K_MIN } from "@warpgogol/pipeline-steps";
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
const stageDir = scratchPath(args.workRoot, "work/privacy-check");

const scoresDb = new Database(
  scratchPath(args.workRoot, "work/scoring/observations.sqlite"),
  { readonly: true },
);
const scores = scoresDb
  .prepare("SELECT overall_score FROM scores WHERE run_id = ?")
  .all(manifest.runId) as { overall_score: number }[];
scoresDb.close();

// Recompute strata independently.
const expected = new Map<string, number>();
for (const s of scores) {
  const key = `d${Math.min(9, Math.floor(s.overall_score * 10))}`;
  expected.set(key, (expected.get(key) ?? 0) + 1);
}

const report = JSON.parse(
  fs.readFileSync(path.join(stageDir, "report.json"), "utf8"),
) as {
  k_min: number;
  mode: string;
  total_strata: number;
  suppressed_strata: number;
  passed: boolean;
  strata: { dimension: string; key: string; count: number; suppressed: boolean }[];
};
if (report.k_min !== DEFAULT_K_MIN) fail(`K_MIN_MISMATCH:${report.k_min}`);
if (report.total_strata !== expected.size) fail("STRATA_COUNT_MISMATCH");
for (const s of report.strata) {
  const want = expected.get(s.key);
  if (want === undefined) fail(`STRATUM_UNKNOWN:${s.key}`);
  if (s.count !== want) fail(`STRATUM_COUNT_MISMATCH:${s.key}`);
  if (s.suppressed !== s.count < report.k_min) fail(`STRATUM_FLAG_MISMATCH:${s.key}`);
}
if (report.suppressed_strata !== report.strata.filter((s) => s.suppressed).length)
  fail("SUPPRESSED_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "privacy-receipt.json"), "utf8"),
) as { schema: string; passed: boolean };
if (receipt.schema !== "hdri-privacy-check@1" || receipt.passed !== report.passed)
  fail("PRIVACY_RECEIPT_INVALID");

emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/privacy-check/report.json",
    "work/privacy-check/projection.jsonl",
    "work/privacy-check/privacy-receipt.json",
  ]),
);
