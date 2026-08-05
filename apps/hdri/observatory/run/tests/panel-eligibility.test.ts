import { describe, expect, it } from "vitest";
import type { Observation } from "@syrokomskyi/observatory-core";
import {
  collectPanelEligibleAssetIds,
  filterPanelEligibleObservations,
} from "../eligibility/panel-eligibility";

const observation = (
  assetId: string,
  signalPath: string,
  valueBool: boolean | null,
): Observation => ({
  observation_id: `${assetId}:${signalPath}`,
  asset_id: assetId,
  crawl_id: "q3",
  signal_path: signalPath,
  value_bool: valueBool,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-07-01T00:00:00.000Z",
  recorded_at: "2026-07-01T00:00:00.000Z",
  collector_version: "test",
  probe_version: "test",
  ruleset_version: "test",
  source_hash: null,
  crawl_hash: "capsule",
  evidence_ref: null,
  confidence: 1,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});

const stream = async function* (items: Observation[]): AsyncGenerator<Observation> {
  yield* items;
};

describe("scientific panel eligibility", () => {
  it("retains a dead previously accepted site and ignores a never-live source relic", async () => {
    const items = [
      observation("da-known", "availability.website.is_reachable", false),
      observation("da-never-live", "availability.website.is_reachable", false),
    ];
    const admission = await collectPanelEligibleAssetIds(stream(items), ["da-known"]);
    const accepted: string[] = [];
    const ignored: string[] = [];
    for await (const item of filterPanelEligibleObservations(
      stream(items),
      admission.eligibleAssetIds,
      (excluded) => ignored.push(excluded.asset_id),
    )) {
      accepted.push(item.asset_id);
    }
    expect(accepted).toEqual(["da-known"]);
    expect(ignored).toEqual(["da-never-live"]);
  });

  it("admits every observation for a new site with explicit current reachability", async () => {
    const items = [
      observation("da-new", "availability.website.is_reachable", true),
      observation("da-new", "legal.impressum.present", true),
    ];
    const admission = await collectPanelEligibleAssetIds(stream(items), []);
    const accepted: Observation[] = [];
    for await (const item of filterPanelEligibleObservations(stream(items), admission.eligibleAssetIds)) {
      accepted.push(item);
    }
    expect(admission.currentReachableAssets).toBe(1);
    expect(accepted).toEqual(items);
  });
});
