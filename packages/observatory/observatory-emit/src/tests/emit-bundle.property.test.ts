import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import { EmitBundleWriter } from "../writer.js";
import { readEmitBundle, streamAssetStates, streamObservations } from "../reader.js";

const INIT = {
  app_id: "3-extract-profile",
  collector_version: "3-extract-profile@1.4.0",
  ruleset_version: "1.3.0",
  ontology_version: "1.1.0",
  run_id: "0192f3a4-5b6c-7d8e-9f01-234567890abc",
  period: "2026-q2",
} as const;

const makeObs = (id: string): Observation => ({
  observation_id: id,
  asset_id: "da-abc",
  crawl_id: "crawl-1",
  signal_path: "legal.impressum.present",
  value_bool: true,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-05-01T00:00:00.000Z",
  recorded_at: "2026-05-01T01:00:00.000Z",
  collector_version: "3-extract-profile@1.4.0",
  probe_version: "rule_v3",
  ruleset_version: "1.3.0",
  source_hash: "h",
  crawl_hash: "2026-q2",
  evidence_ref: null,
  confidence: 1,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});

const makeState = (id: string): AssetStateRecord => ({
  asset_id: id,
  domain: "example.de",
  gewerk_group: "elektro",
  hwo_uid: null,
  hwo_provenance: null,
  bundesland: "DE-BW",
  gemeinde: null,
  mappings: [],
});

async function writeAndReadBack(observations: Observation[], states: AssetStateRecord[]) {
  const emitDir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-pbt-"));
  try {
    const w = new EmitBundleWriter(emitDir, INIT);
    await w.open();
    for (const o of observations) await w.writeObservation(o);
    for (const s of states) await w.writeAssetState(s);
    await w.commit();

    const bundle = await readEmitBundle(emitDir);
    const readObs: Observation[] = [];
    for await (const o of streamObservations(bundle)) readObs.push(o);
    const readStates: AssetStateRecord[] = [];
    for await (const s of streamAssetStates(bundle)) readStates.push(s);
    return { obs: readObs, states: readStates, manifest: bundle.manifest };
  } finally {
    fs.rmSync(emitDir, { recursive: true, force: true });
  }
}

describe("emit-bundle round-trip — property-based", () => {
  it(
    "round-trips any number of observations and states identically",
    { timeout: 30_000 },
    async () => {
      const obsArb = fc.array(
        fc.uuid().map((id) => makeObs(`obs-${id}`)),
        { maxLength: 20 },
      );
      const stateArb = fc.array(
        fc.uuid().map((id) => makeState(`da-${id.slice(0, 8)}`)),
        { maxLength: 10 },
      );

      await fc.assert(
        fc.asyncProperty(obsArb, stateArb, async (observations, states) => {
          const result = await writeAndReadBack(observations, states);
          expect(result.obs).toHaveLength(observations.length);
          expect(result.states).toHaveLength(states.length);
          expect(result.manifest.observation_count).toBe(observations.length);
          expect(result.manifest.asset_state_count).toBe(states.length);
          expect(result.obs.map((o) => o.observation_id)).toEqual(
            observations.map((o) => o.observation_id),
          );
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "empty bundle always has null bundle_hash and yields nothing",
    { timeout: 15_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const result = await writeAndReadBack([], []);
          expect(result.obs).toEqual([]);
          expect(result.states).toEqual([]);
          expect(result.manifest.observation_count).toBe(0);
          expect(result.manifest.bundle_hash).toBeNull();
        }),
        { numRuns: 10 },
      );
    },
  );

  it(
    "non-empty bundle always has a non-null 64-char hex bundle_hash",
    { timeout: 30_000 },
    async () => {
      const obsArb = fc.array(
        fc.uuid().map((id) => makeObs(`obs-${id}`)),
        { minLength: 1, maxLength: 10 },
      );

      await fc.assert(
        fc.asyncProperty(obsArb, async (observations) => {
          const result = await writeAndReadBack(observations, []);
          expect(result.manifest.bundle_hash).toMatch(/^[0-9a-f]{64}$/);
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "observation_count in manifest always equals actual rows written",
    { timeout: 30_000 },
    async () => {
      const obsArb = fc.array(
        fc.uuid().map((id) => makeObs(`obs-${id}`)),
        { maxLength: 20 },
      );

      await fc.assert(
        fc.asyncProperty(obsArb, async (observations) => {
          const result = await writeAndReadBack(observations, []);
          expect(result.manifest.observation_count).toBe(observations.length);
          expect(result.obs).toHaveLength(observations.length);
        }),
        { numRuns: 25 },
      );
    },
  );
});
