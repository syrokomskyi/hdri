/*
<MODULE_CONTRACT>
<purpose>This module provides idempotent database migration and metadata stamping for the liveness.db, ensuring the necessary tables and indices are created and maintained.</purpose>
<non-goals>
  <item>This module does not handle any application-specific logic beyond database schema management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of database migration and metadata stamping functions.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
export { stampSchemaMeta as stampLivenessMeta } from "../schema/schema-meta.js";

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
