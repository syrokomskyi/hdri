import type Database from 'better-sqlite3';

/**
 * Idempotent DDL migration for liveness.db.
 * Owned by site-liveness; read by downstream apps via SQLite ATTACH.
 *
 * Must be called once before any app reads or writes liveness.db.
 */
export const migrateLiveness = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS liveness_checks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id         INTEGER NOT NULL,
      domain          TEXT NOT NULL,
      checked_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      http_status     INTEGER,
      final_url       TEXT,
      redirect_count  INTEGER NOT NULL DEFAULT 0,
      latency_ms      INTEGER,
      is_live         INTEGER NOT NULL DEFAULT 0,
      error_code      TEXT,
      error_msg       TEXT,
      bundesland      TEXT,
      gemeinde        TEXT,
      UNIQUE(site_id)
    );
    CREATE INDEX IF NOT EXISTS lc_live_idx   ON liveness_checks(is_live);
    CREATE INDEX IF NOT EXISTS lc_domain_idx ON liveness_checks(domain);
  `);
};

/**
 * Writes (or replaces) _schema_meta for liveness.db.
 * Call after migrateLiveness, once per DB lifetime.
 */
export const stampLivenessMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run(ownerApp, schemaVersion);
};
