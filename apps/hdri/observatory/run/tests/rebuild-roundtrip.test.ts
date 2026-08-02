/**
 * WP7: rebuild-from-vault round-trip — the durability invariant.
 *
 * Proves "DB → vault → fresh DB → identical scores": a quarter scored from the live DB,
 * round-tripped through the signed Parquet vault and re-scored in a brand-new DB by the
 * frozen codebook, reproduces the SAME overall_score and computation_hash for every asset.
 * This is what lets the vault — not the working DB — be the recoverable source of truth.
 *
 * Exercises the REAL artifacts end to end: the live scoring core (score-core, shared with
 * ScoreHdriGogol), the real DuckDB Parquet VaultWriter/VaultReader, and the rebuild core.
 * Fully isolated in a temp vault dir + in-memory DBs (never touches observatory_2026.db).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VaultReader, VaultWriter } from "@syrokomskyi/observatory-vault";
import { parseCodebookOrThrow, type Codebook } from "@syrokomskyi/hdri-codebook";
import { newId, deriveAssetId } from "@syrokomskyi/observatory-core";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import { migrateObservatory } from "../db/migrate";
import {
  streamInsertObservations,
  writeAssetStatesDeduped,
  type AssetStateInput,
} from "../db/sync-writers";
import { scoreAndWriteForRun, type AssetScore } from "../score/score-core";
import {
  assetStateRecordsForVault,
  insertRebuiltObservations,
  vaultAssetStatesToInputs,
} from "../rebuild/rebuild-core";

const CODEBOOK_PATH = path.resolve(__dirname, "..", "..", ".input", "codebook.yaml");
const YEAR = 2026;
const PERIOD = "2026-q3";
const ONTOLOGY_VERSION = "1.0.0";
const RUN_A = "run-original";
const FACTORY_RUN = "f-q3";
const RUN_B = "run-rebuilt";

let codebook: Codebook;
let vaultDir: string;

// ── Synthetic quarter: two assets with distinct signal profiles (so their scores AND
//    their computation_hashes differ — a trivially-equal hash would not prove anything). ──

const ASSET_1 = deriveAssetId("alpha.de");
const ASSET_2 = deriveAssetId("beta.de");

const SIGNALS_1: Array<[string, boolean]> = [
  ["legal.impressum.present", true],
  ["legal.datenschutz.present", true],
  ["privacy.consent.banner.present", true],
  ["contact.form.present", true],
  ["structured_data.schema_org.local_business.present", true],
  ["trust.certifications.present", true],
  ["social.facebook.present", true],
];

const SIGNALS_2: Array<[string, boolean]> = [
  ["legal.impressum.present", false],
  ["legal.datenschutz.present", false],
  ["privacy.consent.banner.present", false],
  ["contact.form.present", false],
  ["structured_data.schema_org.local_business.present", false],
  ["trust.certifications.present", false],
  ["social.facebook.present", false],
];

const obs = (assetId: string, signal: string, value: boolean): Observation => ({
  observation_id: newId(),
  asset_id: assetId,
  crawl_id: FACTORY_RUN,
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
  crawl_hash: PERIOD,
  evidence_ref: null,
  confidence: 1,
  collection_status: null,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});

const assetState = (assetId: string, domain: string): AssetStateInput => ({
  record: {
    asset_id: assetId,
    domain,
    gewerk_group: "III",
    hwo_uid: null,
    hwo_provenance: null,
    bundesland: "Bayern",
    gemeinde: null,
    mappings: [
      { mapping_system: "destatis_group", target_code: "III", target_label: "Bau", source: "t" },
    ],
  } as AssetStateRecord,
  period: PERIOD,
});

const insertRun = (db: Database.Database, runId: string): void => {
  db.prepare(
    `INSERT INTO pipeline_runs
       (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_version, started_at, status, publication_status)
     VALUES (?, 'observatory', 'v1.0', ?, ?, ?, '2026-07-01T00:00:00Z', 'finished', 'published')`,
  ).run(runId, PERIOD, ONTOLOGY_VERSION, "1.3.0");
};

const insertBundle = (db: Database.Database, runId: string, obsCount: number): void => {
  db.prepare(
    `INSERT OR IGNORE INTO synced_bundles
       (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id, bundle_hash, asset_state_count)
     VALUES (?, 'a-contract-ontology', ?, '2026-07-01T00:00:00Z', ?, '2026-07-01T01:00:00Z', ?, 'h', 2)`,
  ).run(FACTORY_RUN, PERIOD, obsCount, runId);
};

async function* iter<T>(items: T[]): AsyncIterable<T> {
  for (const x of items) yield x;
}

/** Build a fully-synced, scored DB for the quarter (the "live" observatory DB). */
async function buildOriginalDb(): Promise<Database.Database> {
  const db = new Database(":memory:");
  migrateObservatory(db);

  const observations = [
    ...SIGNALS_1.map(([s, v]) => obs(ASSET_1, s, v)),
    ...SIGNALS_2.map(([s, v]) => obs(ASSET_2, s, v)),
  ];
  await streamInsertObservations(db, iter(observations), {
    runId: RUN_A,
    ontologyVersion: ONTOLOGY_VERSION,
    period: PERIOD,
    factoryRunId: FACTORY_RUN,
  });
  writeAssetStatesDeduped(db, [assetState(ASSET_1, "alpha.de"), assetState(ASSET_2, "beta.de")], {
    runId: RUN_A,
    now: "2026-07-01T00:00:00Z",
  });
  insertRun(db, RUN_A);
  insertBundle(db, RUN_A, observations.length);
  return db;
}

/** Replicates WriteVaultGogol's write path: signed observations + asset_states → vault. */
async function writeRunToVault(db: Database.Database, runId: string): Promise<void> {
  const writer = new VaultWriter(vaultDir);

  const rows = db
    .prepare(
      `SELECT obs_json, signature, signed_at, signing_key_id, collector_id
       FROM observations WHERE factory_run_id = ? AND obs_json IS NOT NULL`,
    )
    .all(FACTORY_RUN) as Array<{
    obs_json: string;
    signature: string | null;
    signed_at: string | null;
    signing_key_id: string | null;
    collector_id: string | null;
  }>;
  const signed: SignedObservation[] = rows.map((r) => ({
    ...(JSON.parse(r.obs_json) as Observation),
    signature: r.signature as string,
    signed_at: r.signed_at as string,
    signing_key_id: r.signing_key_id as string,
    collector_id: r.collector_id as string,
  }));
  await writer.writeShard("observations", signed as readonly object[], {
    year: YEAR,
    runId: FACTORY_RUN,
  });

  const stateRecords = assetStateRecordsForVault(db, runId);
  await writer.writeShard("asset_states", stateRecords as readonly object[], { year: YEAR, runId });
}

beforeAll(async () => {
  codebook = parseCodebookOrThrow(fs.readFileSync(CODEBOOK_PATH, "utf-8"), CODEBOOK_PATH);
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp7-roundtrip-"));
});

afterAll(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("WP7 rebuild-from-vault round-trip", () => {
  it("reproduces identical overall_score and computation_hash after a vault round-trip", async () => {
    // 1. Original DB → score it.
    const dbA = await buildOriginalDb();
    const summaryA = scoreAndWriteForRun(dbA, codebook, {
      runId: RUN_A,
      period: PERIOD,
      now: "2026-07-01T02:00:00Z",
    });
    expect(summaryA.scored).toBe(2);
    expect(summaryA.perAsset.size).toBe(2);

    // Sanity: the two assets must genuinely differ — otherwise identity proves nothing.
    const a1 = summaryA.perAsset.get(ASSET_1)!;
    const a2 = summaryA.perAsset.get(ASSET_2)!;
    expect(a1.computationHash).not.toBe(a2.computationHash);
    expect(a1.overallScore).not.toBe(a2.overallScore);

    // 2. DB → vault (real Parquet shards: signed observations + self-contained asset_states).
    await writeRunToVault(dbA, RUN_A);
    dbA.close();

    // 3. Vault → fresh DB.
    const reader = new VaultReader(vaultDir);
    const obsRows = await reader.getAllObservations(YEAR);
    const stateRecords = await reader.getAssetStateRecords(YEAR);

    const dbB = new Database(":memory:");
    migrateObservatory(dbB);
    const insertedObs = insertRebuiltObservations(dbB, obsRows, {
      runId: RUN_B,
      period: PERIOD,
      ontologyVersion: ONTOLOGY_VERSION,
    });
    const stateInputs = vaultAssetStatesToInputs(stateRecords);
    const insertedStates = writeAssetStatesDeduped(dbB, stateInputs, {
      runId: RUN_B,
      now: "2026-10-01T00:00:00Z",
    });
    insertRun(dbB, RUN_B);

    // Rebuild completeness: every observation and asset_state came back.
    expect(insertedObs).toBe(SIGNALS_1.length + SIGNALS_2.length);
    expect(insertedStates).toBe(2);

    // 4. Re-score the rebuilt DB with the SAME frozen codebook.
    const summaryB = scoreAndWriteForRun(dbB, codebook, {
      runId: RUN_B,
      period: PERIOD,
      now: "2026-10-01T02:00:00Z",
    });

    // 5. The invariant: identical per-asset score + computation_hash.
    expect(summaryB.scored).toBe(summaryA.scored);
    expect(summaryB.perAsset.size).toBe(summaryA.perAsset.size);
    for (const [assetId, scoreA] of summaryA.perAsset) {
      const scoreB = summaryB.perAsset.get(assetId);
      expect(scoreB, `asset ${assetId} missing after rebuild`).toBeDefined();
      expect(scoreB!.computationHash, `computation_hash for ${assetId}`).toBe(
        scoreA.computationHash,
      );
      expect(scoreB!.overallScore, `overall_score for ${assetId}`).toBe(scoreA.overallScore);
      expect(scoreB!.confidence, `confidence for ${assetId}`).toBe(scoreA.confidence);
    }

    // And the persisted scores table agrees (run_id differs; the hashes do not).
    const hashesB = new Map(
      (
        dbB
          .prepare(`SELECT asset_id, computation_hash FROM scores WHERE run_id = ?`)
          .all(RUN_B) as Array<{ asset_id: string; computation_hash: string }>
      ).map((r) => [r.asset_id, r.computation_hash]),
    );
    for (const [assetId, scoreA] of summaryA.perAsset as Map<string, AssetScore>) {
      expect(hashesB.get(assetId)).toBe(scoreA.computationHash);
    }

    dbB.close();
  });
});
