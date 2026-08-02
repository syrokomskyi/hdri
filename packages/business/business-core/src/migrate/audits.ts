/*
<MODULE_CONTRACT>
<purpose>This module provides idempotent DDL migrations for Lighthouse and Axe audit databases, creating necessary tables and indexes for storing audit data and metrics.</purpose>
<non-goals>
  <item>This module does not handle the execution of audits or the generation of audit reports.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added idempotent DDL migrations for Lighthouse and Axe audit databases with schema meta stamping functionality.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
export { stampSchemaMeta as stampAuditsMeta } from "../schema/schema-meta.js";

/**
 * Idempotent DDL migration for lighthouse_YYYY.db.
 * Owned by site-lighthouse-audit; stores per-site Lighthouse audit
 * envelopes plus tool-specific metric tables. Raw reports live on disk in CAS;
 * only their sha256 is referenced here.
 */
export const migrateLighthouse = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Common envelope — one row per (tool, site)
    CREATE TABLE IF NOT EXISTS audit_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tool            TEXT NOT NULL,
      site_id         INTEGER NOT NULL,
      url             TEXT NOT NULL,
      fetched_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      duration_ms     INTEGER,
      ok              INTEGER NOT NULL DEFAULT 0,
      error_class     TEXT,
      error_message   TEXT,
      report_sha256   TEXT,
      source          TEXT NOT NULL DEFAULT 'live'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ar_tool_site
      ON audit_runs(tool, site_id);
    CREATE INDEX IF NOT EXISTS ar_tool_idx  ON audit_runs(tool);
    CREATE INDEX IF NOT EXISTS ar_site_idx  ON audit_runs(site_id);

    -- Lighthouse metrics
    CREATE TABLE IF NOT EXISTS lighthouse_runs (
      site_id            INTEGER NOT NULL PRIMARY KEY,
      performance        REAL,
      accessibility      REAL,
      best_practices     REAL,
      seo                REAL,
      lcp_ms             INTEGER,
      cls                REAL,
      tbt_ms             INTEGER,
      lighthouse_version TEXT,
      report_sha256      TEXT
    );
  `);
};

/**
 * Idempotent DDL migration for axe_YYYY.db.
 * Owned by site-axe-audit; stores per-site axe audit
 * envelopes plus tool-specific metric tables. Raw reports live on disk in CAS;
 * only their sha256 is referenced here.
 */
export const migrateAxe = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Common envelope — one row per (tool, site)
    CREATE TABLE IF NOT EXISTS audit_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tool            TEXT NOT NULL,
      site_id         INTEGER NOT NULL,
      url             TEXT NOT NULL,
      fetched_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      duration_ms     INTEGER,
      ok              INTEGER NOT NULL DEFAULT 0,
      error_class     TEXT,
      error_message   TEXT,
      report_sha256   TEXT,
      source          TEXT NOT NULL DEFAULT 'live'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ar_tool_site
      ON audit_runs(tool, site_id);
    CREATE INDEX IF NOT EXISTS ar_tool_idx  ON audit_runs(tool);
    CREATE INDEX IF NOT EXISTS ar_site_idx  ON audit_runs(site_id);

    -- Axe metrics
    CREATE TABLE IF NOT EXISTS axe_runs (
      site_id           INTEGER NOT NULL PRIMARY KEY,
      violations_total  INTEGER NOT NULL DEFAULT 0,
      critical_count    INTEGER NOT NULL DEFAULT 0,
      serious_count     INTEGER NOT NULL DEFAULT 0,
      moderate_count    INTEGER NOT NULL DEFAULT 0,
      minor_count       INTEGER NOT NULL DEFAULT 0,
      nodes_scanned     INTEGER,
      axe_version       TEXT,
      report_sha256     TEXT
    );
  `);
};

/**
 * @deprecated Use migrateLighthouse or migrateAxe instead.
 * Kept for backward compatibility during migration.
 */
export const migrateAudits = migrateLighthouse;
