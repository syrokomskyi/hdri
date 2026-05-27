/*
<MODULE_CONTRACT>
<purpose>Defines and migrates the SQLite schema for the register-businesses local registry database.</purpose>
<keywords>sqlite, registry, migration, schema</keywords>
<responsibilities>
  <item>Create idempotent registry metadata, business registry, and alias tables.</item>
  <item>Maintain indexes required for domain and source-token lookup.</item>
  <item>Stamp registry schema ownership and version metadata.</item>
</responsibilities>
<non-goals>
  <item>Do not read upstream harvest databases.</item>
  <item>Do not mint asset identifiers or sign registry snapshots.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="migrateRegistry">Creates the register-businesses database tables and indexes.</entry>
  <entry key="stampRegistryMeta">Stores owner and schema version metadata for auditability.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial schema implementation for registry database migration and metadata stamping.</item>
  <item>Add GRACE scaffolding for register-businesses validation compliance.</item>
  <item>Update comment to reflect correct database naming pattern registry_<year>.db instead of registry_<sourceToken>.db.</item>
  <item>Add bundesland and gemeinde columns to business_registry (no backward-compat ALTER TABLE — recreate DB from upstream).</item>
</CHANGE_SUMMARY>
*/

import type Database from 'better-sqlite3';

/**
 * Idempotent DDL for registry_<year>.db.
 *
 * Tables:
 *   business_registry — one row per distinct eTLD+1 across all collaborating
 *                       devices for the current year
 *   registry_alias    — alternate domain forms that map to the same da_id
 *                       (subdomains, www-prefix, etc.)
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

    CREATE TABLE IF NOT EXISTS registry_alias (
      da_id            TEXT NOT NULL,
      alternate_domain TEXT NOT NULL,
      source_token     TEXT NOT NULL,
      device_id        TEXT NOT NULL,
      added_at         INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (da_id, alternate_domain)
    );
    CREATE INDEX IF NOT EXISTS ra_alt_idx ON registry_alias(alternate_domain);
  `);
}

export function stampRegistryMeta(db: Database.Database, version: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run('register-businesses', version);
}
