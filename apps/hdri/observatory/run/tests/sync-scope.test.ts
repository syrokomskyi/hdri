/*
<MODULE_CONTRACT>
<purpose>Verify sync-scope preserves the full availability denominator without weakening panel selection.</purpose>
<non-goals><item>Does not authenticate Factory bundles or grant release admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: cover full-population intake, unchanged panel filtering and stream failures.</item></CHANGE_SUMMARY>
*/
import { expect, test } from "vitest";
import type { Observation } from "@syrokomskyi/observatory-core";
import { selectSyncPopulation, syncObservations } from "../eligibility/sync-scope";

function observation(asset_id: string, value_bool: boolean | null): Observation {
  return { observation_id: asset_id, asset_id, crawl_id: "q3", signal_path: "availability.website.is_reachable",
    value_bool, value_num: null, value_str: null, value_json: null, value_type: "bool",
    observed_at: "2026-09-25T00:00:00.000Z", recorded_at: "2026-09-25T00:00:00.000Z",
    collector_version: "test", probe_version: "test", ruleset_version: "test", source_hash: null,
    crawl_hash: "test", evidence_ref: null, confidence: 1, status: "active", superseded_by: null, deprecated_reason: null };
}
const rows = [observation("reachable", true), observation("unavailable", false), observation("blocked", null), observation("indeterminate", null)];
async function* stream() { yield* rows; }
test("availability-only intake keeps every target in source order without rewriting observations", async () => {
  const population = await selectSyncPopulation(stream(), [], ["availability"]);
  expect(population.eligibleAssetIds).toBeNull();
  const ignored: string[] = [];
  const result: Observation[] = [];
  for await (const row of syncObservations(stream(), population.eligibleAssetIds, row => ignored.push(row.asset_id))) result.push(row);
  expect(result.map(row => row.asset_id)).toEqual(["reachable", "unavailable", "blocked", "indeterminate"]);
  expect(result[2]).toBe(rows[2]);
  expect(ignored).toEqual([]);
});
test("panel preparation still excludes never-live targets and retains previously accepted targets", async () => {
  const population = await selectSyncPopulation(stream(), ["unavailable"], ["availability", "panel"]);
  const result: string[] = [];
  for await (const row of syncObservations(stream(), population.eligibleAssetIds, () => {})) result.push(row.asset_id);
  expect(population.observationsScanned).toBe(4);
  expect(result).toEqual(["reachable", "unavailable"]);
});
test("unfiltered intake does not hide a late stream verification failure", async () => {
  async function* failing() { yield* rows; throw new Error("partition verification failed"); }
  await expect((async () => {
    for await (const _ of syncObservations(failing(), null, () => {})) { /* Exhaust verification boundary. */ }
  })()).rejects.toThrow("partition verification failed");
});
