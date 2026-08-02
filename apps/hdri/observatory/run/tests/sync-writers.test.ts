/**
 * Unit tests for the WP1 sync writers: bounded-memory observation insert and
 * collision-safe, deduped asset-state writes.
 *
 * These exercise the real production helpers used by SyncFromFactoryGogol, against
 * an in-memory observatory schema.
 */

import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { newId, deriveAssetId } from "@syrokomskyi/observatory-core";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import { migrateObservatory } from "../db/migrate";
import {
  streamInsertObservations,
  writeAssetStatesDeduped,
  type AssetStateInput,
} from "../db/sync-writers";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrateObservatory(db);
});

afterEach(() => {
  db.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeObs = (overrides: Partial<Observation> = {}): Observation => ({
  observation_id: newId(),
  asset_id: deriveAssetId("example.com"),
  crawl_id: newId(),
  signal_path: "legal.impressum.present",
  value_bool: true,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-04-15T10:00:00.000Z",
  recorded_at: "2026-04-15T12:00:00.000Z",
  collector_version: "a-contract-ontology@0.1.0",
  probe_version: "v1",
  ruleset_version: "1.0.0",
  source_hash: "abc",
  crawl_hash: "2026-q3-de",
  evidence_ref: null,
  confidence: 1,
  collection_status: null,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
  ...overrides,
});

async function* asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

const makeState = (
  assetId: string,
  overrides: Partial<AssetStateRecord> = {},
): AssetStateInput => ({
  record: {
    asset_id: assetId,
    domain: `${assetId}.de`,
    gewerk_group: "III",
    hwo_uid: null,
    hwo_provenance: null,
    bundesland: "Bayern",
    gemeinde: null,
    mappings: [
      { mapping_system: "destatis_group", target_code: "III", target_label: "Bau", source: "rule" },
    ],
    ...overrides,
  },
  period: "2026-q3",
});

const obsOpts = (factoryRunId: string) => ({
  runId: "obs-run-1",
  ontologyVersion: "1.0.0",
  period: "2026-q3",
  factoryRunId,
});

// ── streamInsertObservations ────────────────────────────────────────────────

describe("streamInsertObservations", () => {
  it("inserts a stream larger than the chunk size across multiple chunks", async () => {
    const obs = Array.from({ length: 7 }, (_, i) =>
      makeObs({ observation_id: `o-${i}`, signal_path: `s.${i}` }),
    );
    const res = await streamInsertObservations(db, asAsyncIterable(obs), {
      ...obsOpts("f-1"),
      chunkSize: 3,
    });
    expect(res).toEqual({ inserted: 7, seen: 7 });
    expect((db.prepare("SELECT COUNT(*) c FROM observations").get() as { c: number }).c).toBe(7);
  });

  it("is idempotent on observation_id (re-sync inserts nothing new)", async () => {
    const obs = [makeObs({ observation_id: "dup-1" }), makeObs({ observation_id: "dup-2" })];
    const first = await streamInsertObservations(db, asAsyncIterable(obs), obsOpts("f-1"));
    expect(first.inserted).toBe(2);
    const second = await streamInsertObservations(db, asAsyncIterable(obs), obsOpts("f-1"));
    expect(second).toEqual({ inserted: 0, seen: 2 });
    expect((db.prepare("SELECT COUNT(*) c FROM observations").get() as { c: number }).c).toBe(2);
  });

  it("stores run_id, factory_run_id, period and obs_json on each row", async () => {
    await streamInsertObservations(db, asAsyncIterable([makeObs({ observation_id: "x" })]), {
      ...obsOpts("factory-99"),
    });
    const row = db
      .prepare("SELECT run_id, factory_run_id, period, obs_json FROM observations WHERE id = 'x'")
      .get() as { run_id: string; factory_run_id: string; period: string; obs_json: string };
    expect(row.run_id).toBe("obs-run-1");
    expect(row.factory_run_id).toBe("factory-99");
    expect(row.period).toBe("2026-q3");
    expect(JSON.parse(row.obs_json).observation_id).toBe("x");
  });

  it("emits progress once per flushed chunk", async () => {
    const obs = Array.from({ length: 10 }, (_, i) => makeObs({ observation_id: `p-${i}` }));
    const seenAt: number[] = [];
    await streamInsertObservations(db, asAsyncIterable(obs), {
      ...obsOpts("f-1"),
      chunkSize: 4,
      onProgress: (seen) => seenAt.push(seen),
    });
    // chunks at 4, 8, then final flush at 10
    expect(seenAt).toEqual([4, 8, 10]);
  });
});

// ── writeAssetStatesDeduped ─────────────────────────────────────────────────

describe("writeAssetStatesDeduped", () => {
  it("writes one row per asset and does NOT crash when an asset repeats across bundles", () => {
    // Regression: the same asset in two bundles of one run used to collide on
    // PRIMARY KEY (asset_id, valid_from = now).
    const records: AssetStateInput[] = [
      makeState("da-aaa", { bundesland: "Bayern" }),
      makeState("da-bbb"),
      makeState("da-aaa", { bundesland: "Hessen" }), // duplicate asset, later wins
    ];
    const written = writeAssetStatesDeduped(db, records, {
      runId: "r1",
      now: "2026-07-01T00:00:00Z",
    });
    expect(written).toBe(2);

    const rows = db
      .prepare("SELECT asset_id, bundesland, valid_to FROM asset_states ORDER BY asset_id")
      .all() as Array<{ asset_id: string; bundesland: string; valid_to: string | null }>;
    expect(rows).toHaveLength(2);
    const aaa = rows.find((r) => r.asset_id === "da-aaa")!;
    expect(aaa.bundesland).toBe("Hessen"); // last-write-wins
    expect(aaa.valid_to).toBeNull(); // current open row
  });

  it("SCD-2: a later run expires the prior open row and opens a new one", () => {
    writeAssetStatesDeduped(db, [makeState("da-x")], { runId: "r1", now: "2026-07-01T00:00:00Z" });
    writeAssetStatesDeduped(db, [makeState("da-x")], { runId: "r2", now: "2026-10-01T00:00:00Z" });

    const rows = db
      .prepare(
        "SELECT run_id, valid_from, valid_to FROM asset_states WHERE asset_id = 'da-x' ORDER BY valid_from",
      )
      .all() as Array<{ run_id: string; valid_from: string; valid_to: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.valid_to).toBe("2026-10-01T00:00:00Z"); // prior row closed
    expect(rows[1]!.valid_to).toBeNull(); // new open row
    const open = db
      .prepare("SELECT COUNT(*) c FROM asset_states WHERE asset_id = 'da-x' AND valid_to IS NULL")
      .get() as { c: number };
    expect(open.c).toBe(1);
  });

  it("writes hwo mappings for each asset", () => {
    writeAssetStatesDeduped(db, [makeState("da-m")], { runId: "r1", now: "2026-07-01T00:00:00Z" });
    const m = db
      .prepare("SELECT target_code, run_id FROM asset_hwo_mappings WHERE asset_id = 'da-m'")
      .get() as { target_code: string; run_id: string };
    expect(m.target_code).toBe("III");
    expect(m.run_id).toBe("r1");
  });

  it("returns 0 and writes nothing for an empty input", () => {
    expect(writeAssetStatesDeduped(db, [], { runId: "r1", now: "2026-07-01T00:00:00Z" })).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM asset_states").get() as { c: number }).c).toBe(0);
  });
});
