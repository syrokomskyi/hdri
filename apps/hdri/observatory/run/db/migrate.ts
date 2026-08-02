/*
<MODULE_CONTRACT>
<purpose>Versioned migration runner for the observatory SQLite database (WP9) — this module handles migrate operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage connection lifecycle.</item>
  <item>Do not define schema DDL — that lives in migrations.ts.</item>
  <item>Never rewrite historical observations — enforced by the migrations being additive there.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
  <item>Add scores, score_dimensions, score_indicator_traces, cohorts, cohort_members tables.</item>
  <item>P0.4: add period (observations, scores, asset_states), factory_run_id (observations), crawl_hash (observations).</item>
  <item>Add gewerk_group to asset_states and cohort_members for industry grouping.</item>
  <item>Add publication lifecycle fields and source bundle metadata for canonical quarterly archive publishing.</item>
  <item>Migrate synced_bundles to composite PRIMARY KEY (run_id, observatory_run_id) so multiple observatory runs can reference the same factory bundle.</item>
  <item>Add sd_score_idx, sc_run_asset_idx, and as_run_asset_idx to accelerate dashboard export JOIN queries.</item>
  <item>WP2: one-time dedup of scores and a UNIQUE index scores_run_asset_uniq(run_id, asset_id).</item>
  <item>WP9: convert the monolithic migration into numbered idempotent migrations tracked in applied_migrations, with an automatic backup before any data-losing step.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: migrations are idempotent and recorded in the applied_migrations ledger; never skip the backup step

import type Database from "better-sqlite3";
import { backupDatabase } from "./backup";
import { MIGRATIONS, type Migration } from "./migrations";

export type AppliedMigration = {
  id: number;
  name: string;
  applied_at: string;
};

export type MigrationResult = {
  /** Migrations applied by this call, in order (empty if the DB was already current). */
  applied: { id: number; name: string }[];
  /** Path of the protective backup taken before a destructive step, or null if none was needed. */
  backupPath: string | null;
  /** True when nothing was pending — the DB already matched the latest schema. */
  alreadyCurrent: boolean;
};

/** The append-only ledger of applied migrations — authoritative schema version record. */
const ensureLedger = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `);
};

export const getAppliedMigrations = (db: Database.Database): AppliedMigration[] => {
  ensureLedger(db);
  return db
    .prepare("SELECT id, name, applied_at FROM applied_migrations ORDER BY id")
    .all() as AppliedMigration[];
};

/**
 * Bring the observatory DB up to the latest schema by applying every migration whose
 * id is not yet recorded in applied_migrations. Runs each pending migration once, in
 * order, inside its own transaction; a protective backup is taken first if any pending
 * migration would risk data loss on the current DB. Safe to call on every run.
 */
export const migrateObservatory = (db: Database.Database): MigrationResult => {
  ensureLedger(db);

  const applied = new Set(
    (db.prepare("SELECT id FROM applied_migrations").all() as { id: number }[]).map((r) => r.id),
  );
  const pending: Migration[] = MIGRATIONS.filter((m) => !applied.has(m.id));

  if (pending.length === 0) {
    return { applied: [], backupPath: null, alreadyCurrent: true };
  }

  // Protective backup: only when a pending migration would actually delete/rewrite
  // rows on the current DB. Additive migrations (the common path) never trigger it.
  const needsBackup = pending.some((m) => m.destructiveWhen?.(db) ?? false);
  const backupPath = needsBackup ? backupDatabase(db, "pre-migration") : null;

  const record = db.prepare(
    "INSERT INTO applied_migrations (id, name, applied_at) VALUES (?, ?, ?)",
  );
  const appliedNow: { id: number; name: string }[] = [];

  for (const m of pending) {
    const apply = db.transaction((): void => {
      m.up(db);
      record.run(m.id, m.name, new Date().toISOString());
    });
    apply();
    appliedNow.push({ id: m.id, name: m.name });
  }

  return { applied: appliedNow, backupPath, alreadyCurrent: false };
};

export const stampObservatoryMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(
    `
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `,
  ).run(ownerApp, schemaVersion);
};
