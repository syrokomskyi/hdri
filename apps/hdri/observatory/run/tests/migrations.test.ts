/**
 * WP9: versioned migrations + auto-backup before destructive steps.
 *
 * Invariants under test:
 *  - A pre-WP9 (unversioned) DB migrates forward: every numbered migration is applied
 *    exactly once and recorded in applied_migrations.
 *  - Historical `observations` are NEVER rewritten or deleted — only additive columns
 *    appear, and every original value survives byte-for-byte.
 *  - A protective backup is taken BEFORE a data-losing migration, and only then; the
 *    backup is a valid standalone DB holding the pre-migration state.
 *  - Migrations run once: a second call applies nothing and takes no new backup.
 *  - A fresh DB initialises with no backup (all pending migrations are additive there).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrateObservatory, getAppliedMigrations } from "../db/migrate";
import { MIGRATIONS } from "../db/migrations";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obs-mig-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const openFileDb = (name = "observatory_2026.db"): Database.Database => {
  const db = new Database(path.join(tmpDir, name));
  db.pragma("journal_mode = WAL");
  return db;
};

/** Build a realistic pre-WP9 DB: original table shapes, no applied_migrations ledger. */
const buildLegacyDb = (db: Database.Database): void => {
  db.exec(`
    -- observations BEFORE signing/period/factory columns existed.
    CREATE TABLE observations (
      id                 TEXT PRIMARY KEY,
      asset_id           TEXT NOT NULL,
      signal_path        TEXT NOT NULL,
      ontology_version   TEXT NOT NULL,
      value_bool         INTEGER,
      value_num          REAL,
      value_str          TEXT,
      value_json         TEXT,
      value_type         TEXT NOT NULL,
      observed_at        TEXT NOT NULL,
      recorded_at        TEXT NOT NULL,
      run_id             TEXT NOT NULL,
      evidence_ref       TEXT,
      extractor_version  TEXT,
      confidence         REAL,
      status             TEXT NOT NULL DEFAULT 'active'
    );

    -- scores BEFORE the period column and the UNIQUE(run_id, asset_id) index.
    CREATE TABLE scores (
      id                 TEXT PRIMARY KEY,
      asset_id           TEXT NOT NULL,
      codebook_id        TEXT NOT NULL,
      codebook_version   TEXT NOT NULL,
      overall_score      REAL,
      confidence         REAL NOT NULL,
      computation_hash   TEXT NOT NULL,
      run_id             TEXT NOT NULL,
      scored_at          TEXT NOT NULL
    );

    -- synced_bundles with the legacy single-column PRIMARY KEY.
    CREATE TABLE synced_bundles (
      run_id               TEXT PRIMARY KEY,
      app_id               TEXT NOT NULL,
      period               TEXT NOT NULL,
      emitted_at           TEXT NOT NULL,
      obs_count            INTEGER NOT NULL,
      synced_at            TEXT NOT NULL,
      observatory_run_id   TEXT NOT NULL
    );
  `);

  db.prepare(
    `INSERT INTO observations
       (id, asset_id, signal_path, ontology_version, value_bool, value_num, value_str, value_json,
        value_type, observed_at, recorded_at, run_id, evidence_ref, extractor_version, confidence, status)
     VALUES (@id, @asset_id, @signal_path, @ontology_version, @value_bool, @value_num, @value_str, @value_json,
        @value_type, @observed_at, @recorded_at, @run_id, @evidence_ref, @extractor_version, @confidence, @status)`,
  ).run({
    id: "obs-1",
    asset_id: "da-y",
    signal_path: "legal.impressum.present",
    ontology_version: "1.0",
    value_bool: 1,
    value_num: null,
    value_str: "yes",
    value_json: null,
    value_type: "bool",
    observed_at: "2026-04-01T00:00:00Z",
    recorded_at: "2026-04-01T01:00:00Z",
    run_id: "legacy-run",
    evidence_ref: "https://example.de/impressum",
    extractor_version: "x1",
    confidence: 0.9,
    status: "active",
  });
  db.prepare(
    `INSERT INTO observations
       (id, asset_id, signal_path, ontology_version, value_num, value_type, observed_at, recorded_at, run_id, confidence, status)
     VALUES ('obs-2', 'da-z', 'perf.lcp.ms', '1.0', 2400.5, 'num', '2026-04-02T00:00:00Z', '2026-04-02T01:00:00Z', 'legacy-run', 0.7, 'active')`,
  ).run();

  const insScore = db.prepare(
    `INSERT INTO scores
       (id, asset_id, codebook_id, codebook_version, overall_score, confidence, computation_hash, run_id, scored_at)
     VALUES (?, 'da-y', 'cb', '1.3.0', 50, 1, 'h', 'run-1', '2026-04-01T02:00:00Z')`,
  );
  insScore.run("sc-old"); // rowid 1
  insScore.run("sc-new"); // rowid 2 — duplicate (run_id, asset_id); dedup keeps the newest rowid

  db.prepare(
    `INSERT INTO synced_bundles (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id)
     VALUES ('factory-run', 'hdri', '2026-q2', '2026-04-01T00:00:00Z', 2, '2026-04-01T03:00:00Z', 'legacy-run')`,
  ).run();
};

const OBS_ORIGINAL_COLS =
  "id, asset_id, signal_path, ontology_version, value_bool, value_num, value_str, value_json, " +
  "value_type, observed_at, recorded_at, run_id, evidence_ref, extractor_version, confidence, status";

const columnNames = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);

const tableSql = (db: Database.Database, table: string): string =>
  (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as {
      sql: string;
    }
  ).sql;

const indexExists = (db: Database.Database, name: string): boolean =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name = ?").get(name));

describe("versioned migrations (WP9)", () => {
  it("applies every migration once and records it in applied_migrations", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      const result = migrateObservatory(db);

      expect(result.alreadyCurrent).toBe(false);
      expect(result.applied.map((m) => m.id)).toEqual(MIGRATIONS.map((m) => m.id));

      const ledger = getAppliedMigrations(db);
      expect(ledger.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
      expect(ledger.map((r) => r.name)).toEqual(MIGRATIONS.map((m) => m.name));
      for (const row of ledger) expect(row.applied_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("never rewrites or deletes historical observations", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      const before = db.prepare(`SELECT ${OBS_ORIGINAL_COLS} FROM observations ORDER BY id`).all();

      migrateObservatory(db);

      const after = db.prepare(`SELECT ${OBS_ORIGINAL_COLS} FROM observations ORDER BY id`).all();
      // Every original row and every original value survives byte-for-byte.
      expect(after).toEqual(before);
      const count = db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number };
      expect(count.c).toBe(2);

      // New columns were ADDED (additive), and are NULL for pre-existing rows.
      const cols = columnNames(db, "observations");
      for (const c of [
        "period",
        "factory_run_id",
        "crawl_hash",
        "obs_json",
        "signature",
        "collection_status",
      ]) {
        expect(cols).toContain(c);
      }
      const obs1 = db
        .prepare("SELECT period, factory_run_id, obs_json FROM observations WHERE id='obs-1'")
        .get() as {
        period: string | null;
        factory_run_id: string | null;
        obs_json: string | null;
      };
      expect(obs1).toEqual({ period: null, factory_run_id: null, obs_json: null });
    } finally {
      db.close();
    }
  });

  it("rebuilds synced_bundles to a composite PK while preserving its rows", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      migrateObservatory(db);

      expect(tableSql(db, "synced_bundles")).toContain("PRIMARY KEY (run_id, observatory_run_id)");
      const n = db.prepare("SELECT COUNT(*) AS c FROM synced_bundles").get() as { c: number };
      expect(n.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("dedups duplicate scores and creates the UNIQUE index", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      migrateObservatory(db);

      const rows = db
        .prepare("SELECT id FROM scores WHERE run_id='run-1' AND asset_id='da-y'")
        .all() as { id: string }[];
      expect(rows.map((r) => r.id)).toEqual(["sc-new"]); // newest rowid kept
      expect(indexExists(db, "scores_run_asset_uniq")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("takes a protective backup before the destructive step, capturing pre-migration state", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      const result = migrateObservatory(db);

      expect(result.backupPath).toBeTruthy();
      expect(fs.existsSync(result.backupPath as string)).toBe(true);

      // The backup is a valid standalone DB frozen at the PRE-migration state:
      // duplicate scores still present, synced_bundles still single-column PK.
      const backup = new Database(result.backupPath as string, { readonly: true });
      try {
        const dupes = backup
          .prepare("SELECT COUNT(*) AS c FROM scores WHERE run_id='run-1' AND asset_id='da-y'")
          .get() as { c: number };
        expect(dupes.c).toBe(2);
        expect(tableSql(backup, "synced_bundles")).not.toContain(
          "PRIMARY KEY (run_id, observatory_run_id)",
        );
      } finally {
        backup.close();
      }
    } finally {
      db.close();
    }
  });

  it("is a no-op on a second run: applies nothing and takes no new backup", () => {
    const db = openFileDb();
    try {
      buildLegacyDb(db);
      migrateObservatory(db);
      const backupsDir = path.join(tmpDir, "backups");
      const afterFirst = fs.readdirSync(backupsDir).length;
      expect(afterFirst).toBe(1);

      const second = migrateObservatory(db);
      expect(second.alreadyCurrent).toBe(true);
      expect(second.applied).toEqual([]);
      expect(second.backupPath).toBeNull();
      expect(fs.readdirSync(backupsDir).length).toBe(afterFirst); // no new backup
    } finally {
      db.close();
    }
  });

  it("initialises a fresh DB with no backup (all pending migrations are additive)", () => {
    const db = openFileDb("observatory_fresh.db");
    try {
      const result = migrateObservatory(db);
      expect(result.applied.map((m) => m.id)).toEqual(MIGRATIONS.map((m) => m.id));
      expect(result.backupPath).toBeNull();
      expect(fs.existsSync(path.join(tmpDir, "backups"))).toBe(false);

      // Core tables and the final synced_bundles shape are present.
      for (const t of ["observations", "scores", "synced_bundles", "pipeline_runs", "cohorts"]) {
        expect(
          db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(t),
        ).toBeTruthy();
      }
      expect(tableSql(db, "synced_bundles")).toContain("PRIMARY KEY (run_id, observatory_run_id)");
    } finally {
      db.close();
    }
  });

  it("handles an in-memory DB (no durable file to back up)", () => {
    const db = new Database(":memory:");
    try {
      const result = migrateObservatory(db);
      expect(result.applied.length).toBe(MIGRATIONS.length);
      expect(result.backupPath).toBeNull();
    } finally {
      db.close();
    }
  });
});
