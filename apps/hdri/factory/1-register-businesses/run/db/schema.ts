/*
<MODULE_CONTRACT>
<purpose>Defines and migrates the SQLite schema for the register-businesses local registry database.</purpose>
<non-goals>
  <item>Do not read upstream harvest databases.</item>
  <item>Do not mint asset identifiers or sign registry snapshots.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial schema implementation for registry database migration and metadata stamping.</item>
  <item>Add COMPASS scaffolding for register-businesses validation compliance.</item>
  <item>Update comment to reflect correct database naming pattern registry_<year>.db instead of registry_<sourceToken>.db.</item>
  <item>Add bundesland and gemeinde columns to business_registry (no backward-compat ALTER TABLE — recreate DB from upstream).</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: migrations are idempotent and recorded in the applied_migrations ledger; never skip the backup step

import type Database from "better-sqlite3";

/**
 * Idempotent DDL for registry_<year>.db.
 *
 * Tables:
 *   business_registry — one row per distinct eTLD+1 across all collaborating
 *                       devices for the current year
 *
 * Provenance columns on business_registry record which device first observed
 * the business, when, and on which sourceToken — so that later audits can
 * trace any da-* identity back to its originating extractor run.
 */
export function migrateRegistry(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app      TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS business_registry (
      da_id                  TEXT PRIMARY KEY,
      domain                 TEXT NOT NULL UNIQUE,
      bundesland             TEXT,
      gemeinde               TEXT,
      first_seen_source_token TEXT NOT NULL,
      first_seen_device_id   TEXT NOT NULL,
      first_seen_at          INTEGER NOT NULL DEFAULT (unixepoch()),
      sites_count            INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS br_domain_idx ON business_registry(domain);
    CREATE INDEX IF NOT EXISTS br_first_seen_token_idx ON business_registry(first_seen_source_token);
  `);
}

export function stampRegistryMeta(db: Database.Database, version: string): void {
  db.prepare(
    `
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `,
  ).run("register-businesses", version);
}
