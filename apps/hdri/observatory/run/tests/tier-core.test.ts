/**
 * WP14: hot/cold obs_json tiering — the reclaim-safely invariant.
 *
 * Proves the tiering core (1) only offers cold periods as candidates while protecting the
 * published baseline (Q2) and the latest period, (2) refuses to evict a run unless its vault
 * shard is present, hash-matches the manifest, AND covers every DB observation id, and (3) after
 * eviction, obs_json is fully recoverable from the vault and the recovered copy STILL verifies its
 * ed25519 signature — i.e. eviction never loses signed ground truth.
 *
 * Exercises the REAL artifacts: DuckDB Parquet VaultWriter/VaultReader, the shard manifest, the
 * crypto sign/verify path, and the shared normalize+rebuild core. Isolated in a temp vault + an
 * in-memory DB (never touches observatory_2026.db).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  VaultReader,
  VaultWriter,
  emptyManifest,
  obsShardPath,
  readManifest,
} from "@syrokomskyi/observatory-vault";
import { newId, deriveAssetId, type Observation } from "@syrokomskyi/observatory-core";
import {
  generateSigningKey,
  signObservation,
  verifyObservation,
  type SignedObservation,
  type SigningKeyConfig,
} from "@syrokomskyi/observatory-crypto";
import { migrateObservatory } from "../db/migrate";
import {
  PUBLISHED_BASELINE_PERIOD,
  checkRunRecoverable,
  dbObsJsonIds,
  evictObsJson,
  isEvictable,
  latestPeriodInDb,
  periodLt,
  reconstructObsJsonFromVault,
  rehydrateObsJson,
  selectColdCandidates,
  type ColdPolicy,
} from "../../tools/tier-core";

const YEAR = 2026;
const ASSET = deriveAssetId("alpha.de");

let vaultDir: string;
let signingKey: SigningKeyConfig;

function mkObs(factoryRun: string, period: string, signal: string, value: boolean): Observation {
  return {
    observation_id: newId(),
    asset_id: ASSET,
    crawl_id: factoryRun,
    signal_path: signal,
    value_bool: value,
    value_num: null,
    value_str: null,
    value_json: null,
    value_type: "bool",
    observed_at: "2026-01-01T00:00:00.000Z",
    recorded_at: "2026-01-01T01:00:00.000Z",
    collector_version: "test@0.0.0",
    probe_version: "rule_v3",
    ruleset_version: "1.0.0",
    source_hash: ASSET,
    crawl_hash: period,
    evidence_ref: null,
    confidence: 1,
    collection_status: null,
    status: "active",
    superseded_by: null,
    deprecated_reason: null,
  };
}

const insertRun = (db: Database.Database, runId: string, period: string, pub: string): void => {
  db.prepare(
    `INSERT INTO pipeline_runs
       (run_id, pipeline_app, pipeline_version, period, ontology_version, codebook_version, started_at, status, publication_status)
     VALUES (?, 'observatory', 'v1', ?, '1.0.0', '1.0.0', '2026-01-01T00:00:00Z', 'finished', ?)`,
  ).run(runId, period, pub);
};

/** Inserts signed observations for one factory run into the DB (obs_json + signing columns). */
function insertSignedRun(db: Database.Database, factoryRun: string, period: string): Observation[] {
  const observations = [
    mkObs(factoryRun, period, "legal.impressum.present", true),
    mkObs(factoryRun, period, "legal.datenschutz.present", false),
  ];
  const stmt = db.prepare(
    `INSERT INTO observations
       (id, asset_id, signal_path, ontology_version, value_bool, value_num, value_str, value_json,
        value_type, observed_at, recorded_at, run_id, evidence_ref, extractor_version, confidence,
        status, obs_json, period, factory_run_id, crawl_hash,
        signature, signed_at, signing_key_id, collector_id)
     VALUES (?, ?, ?, '1.0.0', ?, NULL, NULL, NULL, 'bool', ?, ?, 'obs-run', NULL, ?, ?, 'active',
             ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const o of observations) {
    const s = signObservation(o, signingKey);
    stmt.run(
      o.observation_id,
      o.asset_id,
      o.signal_path,
      o.value_bool ? 1 : 0,
      o.observed_at,
      o.recorded_at,
      o.probe_version,
      o.confidence,
      JSON.stringify(o),
      o.crawl_hash, // period
      o.crawl_id, // factory_run_id
      o.crawl_hash, // crawl_hash
      s.signature,
      s.signed_at,
      s.signing_key_id,
      s.collector_id,
    );
  }
  return observations;
}

/** Writes a run's signed observations to the vault and records the shard in the manifest. */
async function vaultRun(db: Database.Database, factoryRun: string): Promise<void> {
  const rows = db
    .prepare(
      `SELECT obs_json, signature, signed_at, signing_key_id, collector_id
         FROM observations WHERE factory_run_id = ? AND obs_json IS NOT NULL`,
    )
    .all(factoryRun) as Array<{
    obs_json: string;
    signature: string;
    signed_at: string;
    signing_key_id: string;
    collector_id: string;
  }>;
  const signed: SignedObservation[] = rows.map((r) => ({
    ...(JSON.parse(r.obs_json) as Observation),
    signature: r.signature,
    signed_at: r.signed_at,
    signing_key_id: r.signing_key_id,
    collector_id: r.collector_id,
  }));
  const writer = new VaultWriter(vaultDir);
  await writer.writeShard("observations", signed as readonly object[], {
    year: YEAR,
    runId: factoryRun,
  });
}

beforeEach(() => {
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp14-tier-"));
  const { privateKeyPem, publicKeyPem } = generateSigningKey();
  const fp = crypto.createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
  signingKey = {
    privateKeyPem,
    publicKeyPem,
    signingKeyId: `test-device-${fp}`,
    collectorId: "test-device",
  };
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("WP14 tier-core — period policy", () => {
  it("orders periods and protects baseline + latest by default", () => {
    expect(periodLt("2026-q1", "2026-q2")).toBe(true);
    expect(periodLt("2026-q4", "2027-q1")).toBe(true);
    expect(periodLt("2026-q2", "2026-q2")).toBe(false);

    const policy: ColdPolicy = {
      baselinePeriod: PUBLISHED_BASELINE_PERIOD, // 2026-q2
      latestPeriod: "2026-q4",
      includeBaseline: false,
    };
    expect(isEvictable("2026-q1", policy)).toBe(true); // older than q2 and q4
    expect(isEvictable("2026-q2", policy)).toBe(false); // baseline protected
    expect(isEvictable("2026-q3", policy)).toBe(false); // not older than baseline q2? q3 > q2 → blocked
    expect(isEvictable("2026-q4", policy)).toBe(false); // latest protected
  });

  it("includeBaseline lets Q2 through but still protects latest", () => {
    const policy: ColdPolicy = {
      baselinePeriod: "2026-q2",
      latestPeriod: "2026-q4",
      includeBaseline: true,
    };
    expect(isEvictable("2026-q2", policy)).toBe(true);
    expect(isEvictable("2026-q3", policy)).toBe(true);
    expect(isEvictable("2026-q4", policy)).toBe(false);
  });

  it("with no latest period known, nothing is evictable", () => {
    expect(
      isEvictable("2020-q1", {
        baselinePeriod: "2026-q2",
        latestPeriod: null,
        includeBaseline: true,
      }),
    ).toBe(false);
  });
});

describe("WP14 tier-core — candidate selection", () => {
  it("selects only cold runs and reads the latest period from the DB", () => {
    const db = new Database(":memory:");
    migrateObservatory(db);
    insertSignedRun(db, "f-q1", "2026-q1");
    insertSignedRun(db, "f-q2", "2026-q2");
    insertSignedRun(db, "f-q3", "2026-q3");
    insertRun(db, "r-q3", "2026-q3", "published");

    expect(latestPeriodInDb(db)).toBe("2026-q3");

    const policy: ColdPolicy = {
      baselinePeriod: PUBLISHED_BASELINE_PERIOD,
      latestPeriod: latestPeriodInDb(db),
      includeBaseline: false,
    };
    const candidates = selectColdCandidates(db, policy);
    expect(candidates.map((c) => c.period)).toEqual(["2026-q1"]);
    expect(candidates[0]!.obsWithJson).toBe(2);
    expect(candidates[0]!.jsonBytes).toBeGreaterThan(0);
    db.close();
  });
});

describe("WP14 tier-core — recoverability gate", () => {
  it("BLOCKS a run with no vault shard, PASSES once vaulted, and detects a missing shard", async () => {
    const db = new Database(":memory:");
    migrateObservatory(db);
    insertSignedRun(db, "f-q1", "2026-q1");
    insertRun(db, "r-live", "2026-q3", "published");

    const policy: ColdPolicy = {
      baselinePeriod: PUBLISHED_BASELINE_PERIOD,
      latestPeriod: "2026-q3",
      includeBaseline: false,
    };
    const [run] = selectColdCandidates(db, policy);
    expect(run).toBeDefined();

    const reader = new VaultReader(vaultDir);

    // Not vaulted yet → blocked.
    let gate = await checkRunRecoverable(db, reader, vaultDir, emptyManifest(), run!);
    expect(gate.ok).toBe(false);
    expect(gate.reasons[0]).toMatch(/no observations shard/);

    // Vault it → passes with full coverage.
    await vaultRun(db, "f-q1");
    gate = await checkRunRecoverable(db, reader, vaultDir, await readManifest(vaultDir), run!);
    expect(gate.ok).toBe(true);
    expect(gate.missingInVault).toEqual([]);
    expect(gate.vaultIdCount).toBe(2);
    expect(gate.dbIdCount).toBe(2);

    // Delete the shard file on disk → manifest still lists it → MISSING detected.
    fs.rmSync(obsShardPath(vaultDir, YEAR, "f-q1"));
    gate = await checkRunRecoverable(db, reader, vaultDir, await readManifest(vaultDir), run!);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/MISSING/);
    db.close();
  });

  it("BLOCKS when the vault shard does not cover every DB observation", async () => {
    const db = new Database(":memory:");
    migrateObservatory(db);
    insertSignedRun(db, "f-q1", "2026-q1");
    insertRun(db, "r-live", "2026-q3", "published");
    await vaultRun(db, "f-q1");

    // A new signed observation lands in the DB AFTER the shard was written → not in the vault.
    const extra = mkObs("f-q1", "2026-q1", "privacy.consent.banner.present", true);
    const s = signObservation(extra, signingKey);
    db.prepare(
      `INSERT INTO observations
         (id, asset_id, signal_path, ontology_version, value_type, observed_at, recorded_at, run_id,
          confidence, status, obs_json, period, factory_run_id, crawl_hash, signature, signed_at, signing_key_id, collector_id)
       VALUES (?, ?, ?, '1.0.0', 'bool', ?, ?, 'obs-run', 1, 'active', ?, '2026-q1', 'f-q1', '2026-q1', ?, ?, ?, ?)`,
    ).run(
      extra.observation_id,
      extra.asset_id,
      extra.signal_path,
      extra.observed_at,
      extra.recorded_at,
      JSON.stringify(extra),
      s.signature,
      s.signed_at,
      s.signing_key_id,
      s.collector_id,
    );

    const reader = new VaultReader(vaultDir);
    const run = selectColdCandidates(db, {
      baselinePeriod: PUBLISHED_BASELINE_PERIOD,
      latestPeriod: "2026-q3",
      includeBaseline: false,
    })[0]!;
    const gate = await checkRunRecoverable(db, reader, vaultDir, await readManifest(vaultDir), run);
    expect(gate.ok).toBe(false);
    expect(gate.missingInVault).toContain(extra.observation_id);
    db.close();
  });
});

describe("WP14 tier-core — evict + reverse-path recovery", () => {
  it("evicts obs_json and recovers a signature-valid copy from the vault", async () => {
    const db = new Database(":memory:");
    migrateObservatory(db);
    const original = insertSignedRun(db, "f-q1", "2026-q1");
    insertRun(db, "r-live", "2026-q3", "published");
    await vaultRun(db, "f-q1");

    // Evict.
    const ids = dbObsJsonIds(db, "f-q1");
    expect(ids).toHaveLength(2);
    const evicted = evictObsJson(db, ids);
    expect(evicted).toBe(2);
    const nullCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM observations WHERE factory_run_id = 'f-q1' AND obs_json IS NULL`,
        )
        .get() as { c: number }
    ).c;
    expect(nullCount).toBe(2);

    // Reverse path: reconstruct from the vault.
    const reader = new VaultReader(vaultDir);
    const map = await reconstructObsJsonFromVault(reader, YEAR, "f-q1");
    expect(map.size).toBe(2);

    // The recovered observation still verifies its ed25519 signature (ground truth intact).
    const vk = { publicKeyPem: signingKey.publicKeyPem, signingKeyId: signingKey.signingKeyId };
    for (const o of original) {
      const recoveredJson = map.get(o.observation_id);
      expect(recoveredJson, `recovered obs_json for ${o.observation_id}`).toBeDefined();
      const sigRow = db
        .prepare(
          `SELECT signature, signed_at, signing_key_id, collector_id FROM observations WHERE id = ?`,
        )
        .get(o.observation_id) as {
        signature: string;
        signed_at: string;
        signing_key_id: string;
        collector_id: string;
      };
      const recovered: SignedObservation = {
        ...(JSON.parse(recoveredJson!) as Observation),
        signature: sigRow.signature,
        signed_at: sigRow.signed_at,
        signing_key_id: sigRow.signing_key_id,
        collector_id: sigRow.collector_id,
      };
      expect(verifyObservation(recovered, vk)).toBe(true);
    }

    // Rehydrate writes it back only where NULL.
    const restored = rehydrateObsJson(db, map);
    expect(restored).toBe(2);
    const stillNull = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM observations WHERE factory_run_id = 'f-q1' AND obs_json IS NULL`,
        )
        .get() as { c: number }
    ).c;
    expect(stillNull).toBe(0);

    // Rehydrate is a no-op the second time (nothing NULL left to fill).
    expect(rehydrateObsJson(db, map)).toBe(0);
    db.close();
  });
});
