/**
 * Q3 cross-quarter integration test — exercises the REAL data-layer chain on
 * synthetic Q2 + Q3 data simulating the ×3 sample growth, fully isolated in a
 * temp DB (never touches the published observatory_2026.db).
 *
 * Proves the Q3-readiness guarantees end to end:
 *  - sync writers (WP1) land observations + asset_states for both quarters and
 *    are idempotent on re-sync;
 *  - validator invariants (WP0/WP2) hold: exactly one published run per period,
 *    no duplicate scores, no asset_states JOIN fan-out;
 *  - the cross-quarter comparison is composition-robust (WP4): the cross-section
 *    mean DROPS when Q3 adds many low-scoring businesses, while the matched-panel
 *    delta over the SAME businesses correctly RISES.
 */

import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newId, deriveAssetId } from "@syrokomskyi/observatory-core";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import { migrateObservatory } from "../db/migrate";
import {
  streamInsertObservations,
  writeAssetStatesDeduped,
  type AssetStateInput,
} from "../db/sync-writers";
import { buildPanelTrends, type PeriodScores } from "../../tools/panel-core";
import { mean } from "../../tools/stats-core";

let db: Database.Database;

const OLD_N = 40;
const NEW_N = 80; // Q3 triples the sample: 40 old + 80 new = 120
const Q2_RUN = "run-q2";
const Q3_RUN = "run-q3";

const oldId = (i: number): string => deriveAssetId(`old-${i}.de`);
const newId_ = (i: number): string => deriveAssetId(`new-${i}.de`);

async function* iter<T>(items: T[]): AsyncIterable<T> {
  for (const x of items) yield x;
}

const obs = (assetId: string, signal: string, value: boolean, period: string): Observation => ({
  observation_id: newId(),
  asset_id: assetId,
  crawl_id: newId(),
  signal_path: signal,
  value_bool: value,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-07-01T00:00:00.000Z",
  recorded_at: "2026-07-01T01:00:00.000Z",
  collector_version: "test@0.0.0",
  probe_version: "rule_v3",
  ruleset_version: "1.0.0",
  source_hash: assetId,
  crawl_hash: period,
  evidence_ref: null,
  confidence: 1,
  collection_status: null,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});

const state = (assetId: string): AssetStateInput => ({
  record: {
    asset_id: assetId,
    domain: `${assetId}.de`,
    gewerk_group: "III",
    hwo_uid: null,
    hwo_provenance: null,
    bundesland: "Bayern",
    gemeinde: null,
    mappings: [
      { mapping_system: "destatis_group", target_code: "III", target_label: "Bau", source: "t" },
    ],
  } as AssetStateRecord,
  period: "2026-q3",
});

const insertRun = (runId: string, period: string): void => {
  db.prepare(
    `INSERT INTO pipeline_runs
       (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_version, started_at, finished_at, status, publication_status)
     VALUES (?, 'observatory', 'v1.0', ?, '1.0.0', '1.3.0', '2026-07-01T00:00:00Z', '2026-07-01T02:00:00Z', 'finished', 'published')`,
  ).run(runId, period);
};

const insertBundle = (
  factoryRunId: string,
  runId: string,
  period: string,
  obsCount: number,
): void => {
  db.prepare(
    `INSERT OR IGNORE INTO synced_bundles
       (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id, bundle_hash, asset_state_count)
     VALUES (?, 'a-contract-ontology', ?, '2026-07-01T00:00:00Z', ?, '2026-07-01T01:00:00Z', ?, 'h', ?)`,
  ).run(factoryRunId, period, obsCount, runId, obsCount);
};

const insertScore = (runId: string, period: string, assetId: string, score: number): void => {
  db.prepare(
    `INSERT INTO scores
       (id, asset_id, codebook_id, codebook_version, overall_score, confidence, computation_hash, run_id, scored_at, period)
     VALUES (?, ?, 'observatory-v1', '1.3.0', ?, 1, 'h', ?, '2026-07-01T02:00:00Z', ?)`,
  ).run(newId(), assetId, score, runId, period);
};

const periodScores = (runId: string, period: string): PeriodScores => {
  const rows = db
    .prepare(
      `SELECT asset_id, overall_score FROM scores WHERE run_id = ? AND overall_score IS NOT NULL`,
    )
    .all(runId) as Array<{ asset_id: string; overall_score: number }>;
  const scores = new Map<string, number>();
  for (const r of rows) scores.set(r.asset_id, r.overall_score);
  return { period, scores };
};

beforeAll(async () => {
  db = new Database(":memory:");
  migrateObservatory(db);

  // ── Q2: 40 businesses ──────────────────────────────────────────────────────
  const q2Obs = Array.from({ length: OLD_N }, (_, i) =>
    obs(oldId(i), "legal.impressum.present", true, "2026-q2"),
  );
  await streamInsertObservations(db, iter(q2Obs), {
    runId: Q2_RUN,
    ontologyVersion: "1.0.0",
    period: "2026-q2",
    factoryRunId: "f-q2",
    chunkSize: 7,
  });
  writeAssetStatesDeduped(
    db,
    Array.from({ length: OLD_N }, (_, i) => state(oldId(i))),
    { runId: Q2_RUN, now: "2026-07-01T00:00:00Z" },
  );
  insertRun(Q2_RUN, "2026-q2");
  insertBundle("f-q2", Q2_RUN, "2026-q2", q2Obs.length);
  for (let i = 0; i < OLD_N; i++) insertScore(Q2_RUN, "2026-q2", oldId(i), 50);

  // ── Q3: same 40 (improved) + 80 new low-scoring = ×3 ───────────────────────
  const q3Obs = [
    ...Array.from({ length: OLD_N }, (_, i) =>
      obs(oldId(i), "legal.impressum.present", true, "2026-q3"),
    ),
    ...Array.from({ length: NEW_N }, (_, i) =>
      obs(newId_(i), "legal.impressum.present", false, "2026-q3"),
    ),
  ];
  await streamInsertObservations(db, iter(q3Obs), {
    runId: Q3_RUN,
    ontologyVersion: "1.0.0",
    period: "2026-q3",
    factoryRunId: "f-q3",
    chunkSize: 7,
  });
  writeAssetStatesDeduped(
    db,
    [
      ...Array.from({ length: OLD_N }, (_, i) => state(oldId(i))),
      ...Array.from({ length: NEW_N }, (_, i) => state(newId_(i))),
    ],
    { runId: Q3_RUN, now: "2026-10-01T00:00:00Z" },
  );
  insertRun(Q3_RUN, "2026-q3");
  insertBundle("f-q3", Q3_RUN, "2026-q3", q3Obs.length);
  for (let i = 0; i < OLD_N; i++) insertScore(Q3_RUN, "2026-q3", oldId(i), 56); // improved +6
  for (let i = 0; i < NEW_N; i++) insertScore(Q3_RUN, "2026-q3", newId_(i), 20); // low newcomers
});

afterAll(() => db.close());

describe("Q3 sync chain", () => {
  it("lands observations for both quarters with correct period/run tagging", () => {
    const byPeriod = db
      .prepare(`SELECT period, COUNT(*) c FROM observations GROUP BY period ORDER BY period`)
      .all() as Array<{ period: string; c: number }>;
    expect(byPeriod).toEqual([
      { period: "2026-q2", c: OLD_N },
      { period: "2026-q3", c: OLD_N + NEW_N },
    ]);
  });

  it("is idempotent — re-syncing the Q3 bundle inserts nothing new", async () => {
    // Reuse the exact same observation_id as an already-synced row.
    const existing = db
      .prepare(`SELECT id FROM observations WHERE period = '2026-q3' LIMIT 1`)
      .get() as { id: string };
    const sameObs = [
      { ...obs(oldId(0), "legal.impressum.present", true, "2026-q3"), observation_id: existing.id },
    ];
    const before = (db.prepare(`SELECT COUNT(*) c FROM observations`).get() as { c: number }).c;
    const res = await streamInsertObservations(db, iter(sameObs), {
      runId: Q3_RUN,
      ontologyVersion: "1.0.0",
      period: "2026-q3",
      factoryRunId: "f-q3",
    });
    const after = (db.prepare(`SELECT COUNT(*) c FROM observations`).get() as { c: number }).c;
    expect(res.inserted).toBe(0);
    expect(after).toBe(before);
  });
});

describe("validator invariants on the two-quarter DB", () => {
  it("has exactly one published run per period", () => {
    const rows = db
      .prepare(
        `SELECT period, COUNT(*) c FROM pipeline_runs
         WHERE status='finished' AND publication_status='published' GROUP BY period`,
      )
      .all() as Array<{ period: string; c: number }>;
    expect(rows.every((r) => r.c === 1)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("has no duplicate scores per (run_id, asset_id)", () => {
    const dup = db
      .prepare(
        `SELECT COUNT(*) c FROM (SELECT 1 FROM scores GROUP BY run_id, asset_id HAVING COUNT(*) > 1)`,
      )
      .get() as { c: number };
    expect(dup.c).toBe(0);
  });

  it("has no asset_states JOIN fan-out per (asset_id, run_id)", () => {
    const fan = db
      .prepare(
        `SELECT COUNT(*) c FROM (SELECT 1 FROM asset_states GROUP BY asset_id, run_id HAVING COUNT(*) > 1)`,
      )
      .get() as { c: number };
    expect(fan.c).toBe(0);
  });

  it("the export JOIN (scores ⋈ asset_states on asset_id+run_id) is 1:1 for the published Q3 run", () => {
    const joined = db
      .prepare(
        `SELECT COUNT(*) c FROM scores s
         JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
         WHERE s.run_id = ?`,
      )
      .get(Q3_RUN) as { c: number };
    expect(joined.c).toBe(OLD_N + NEW_N); // no inflation
  });

  it("Q2 still exports fully after Q3 lands (SCD-2 expiry does not drop the Q2 snapshot)", () => {
    // Writing Q3 asset states closes the Q2 rows (valid_to set). The export keys
    // off run_id, not valid_to, so the published Q2 snapshot must remain intact —
    // this is the "both quarters stay on the dashboard" guarantee.
    const expiredQ2 = db
      .prepare(`SELECT COUNT(*) c FROM asset_states WHERE run_id = ? AND valid_to IS NOT NULL`)
      .get(Q2_RUN) as { c: number };
    expect(expiredQ2.c).toBe(OLD_N); // Q2 rows were expired by Q3

    const q2Join = db
      .prepare(
        `SELECT COUNT(*) c FROM scores s
         JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
         WHERE s.run_id = ?`,
      )
      .get(Q2_RUN) as { c: number };
    expect(q2Join.c).toBe(OLD_N); // …yet Q2 still joins 1:1 and exports fully
  });
});

describe("composition robustness (cross-section vs matched panel)", () => {
  it("cross-section mean DROPS while the matched-panel delta RISES", () => {
    const q2 = periodScores(Q2_RUN, "2026-q2");
    const q3 = periodScores(Q3_RUN, "2026-q3");

    // Repeated cross-section: confounded by the new low-scoring cohort.
    const crossQ2 = mean([...q2.scores.values()]);
    const crossQ3 = mean([...q3.scores.values()]);
    expect(crossQ2).toBe(50);
    expect(crossQ3).toBeCloseTo((OLD_N * 56 + NEW_N * 20) / (OLD_N + NEW_N), 5); // = 32
    expect(crossQ3).toBeLessThan(crossQ2); // naive trend says "down"

    // Matched panel over the SAME 40 businesses: the real, composition-robust trend.
    const [panel] = buildPanelTrends([q2, q3], 5);
    expect(panel!.nPanel).toBe(OLD_N);
    expect(panel!.meanChange).toBe(6); // every matched business improved by +6
    expect(panel!.significant).toBe(true);
    expect(panel!.reliability).toBe("reliable");
    expect(panel!.coverage).toBeCloseTo(OLD_N / (OLD_N + NEW_N), 1); // ≈ 0.33
  });
});
