/**
 * WP2: scoring idempotency guarantees at the schema level.
 *
 * - migrateObservatory creates a UNIQUE index on scores(run_id, asset_id).
 * - that index rejects a second score for the same (run_id, asset_id).
 * - the one-time migration dedups pre-existing duplicate scores (and their
 *   dependent dimension/trace rows) so the index can be created on databases
 *   that already accumulated duplicates from earlier runs.
 */

import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrateObservatory } from "../db/migrate";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrateObservatory(db);
});

afterEach(() => {
  db.close();
});

const insertScore = (id: string, runId: string, assetId: string): void => {
  db.prepare(
    `INSERT INTO scores
       (id, asset_id, codebook_id, codebook_version, overall_score, confidence, computation_hash, run_id, scored_at, period)
     VALUES (?, ?, 'cb', '1.3.0', 50, 1, 'h', ?, '2026-07-01T00:00:00Z', '2026-q3')`,
  ).run(id, assetId, runId);
};

const indexExists = (name: string): boolean =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name = ?").get(name));

describe("scores idempotency schema", () => {
  it("creates the UNIQUE (run_id, asset_id) index", () => {
    expect(indexExists("scores_run_asset_uniq")).toBe(true);
  });

  it("rejects a duplicate score for the same (run_id, asset_id)", () => {
    insertScore("s1", "run-1", "da-x");
    expect(() => insertScore("s2", "run-1", "da-x")).toThrow();
    // A different run for the same asset is allowed (cross-quarter / re-run lineage).
    expect(() => insertScore("s3", "run-2", "da-x")).not.toThrow();
  });

  it("migration dedups pre-existing duplicates and rebuilds the unique index", () => {
    // Simulate a legacy DB that accumulated duplicate scores before the dedup migration
    // ever ran: drop the index AND rewind the ledger so migration 7 is pending again.
    db.exec("DROP INDEX scores_run_asset_uniq");
    db.prepare("DELETE FROM applied_migrations WHERE name = 'scores-unique-dedup'").run();
    insertScore("dup-a", "run-1", "da-y");
    insertScore("dup-b", "run-1", "da-y"); // duplicate (run_id, asset_id)
    db.prepare(
      `INSERT INTO score_dimensions (score_id, dimension_id, score, confidence, effective_weight)
       VALUES ('dup-a', 'legal_compliance', 50, 1, 0.3)`,
    ).run();
    db.prepare(
      `INSERT INTO score_indicator_traces
         (score_id, dimension_id, indicator_id, input_key, rule_type, weight, confidence)
       VALUES ('dup-a', 'legal_compliance', 'impressum', 'legal.impressum.present', 'bool', 0.25, 1)`,
    ).run();

    // Re-run migration → should dedup and recreate the unique index.
    migrateObservatory(db);

    const remaining = db
      .prepare("SELECT COUNT(*) c FROM scores WHERE run_id = 'run-1' AND asset_id = 'da-y'")
      .get() as { c: number };
    expect(remaining.c).toBe(1);
    expect(indexExists("scores_run_asset_uniq")).toBe(true);

    // Dependent rows of the removed duplicate must be gone (kept row is dup-b, the newest rowid).
    const keptId = (
      db.prepare("SELECT id FROM scores WHERE run_id='run-1' AND asset_id='da-y'").get() as {
        id: string;
      }
    ).id;
    expect(keptId).toBe("dup-b");
    const orphanDims = db
      .prepare("SELECT COUNT(*) c FROM score_dimensions WHERE score_id = 'dup-a'")
      .get() as { c: number };
    const orphanTraces = db
      .prepare("SELECT COUNT(*) c FROM score_indicator_traces WHERE score_id = 'dup-a'")
      .get() as { c: number };
    expect(orphanDims.c).toBe(0);
    expect(orphanTraces.c).toBe(0);
  });
});
