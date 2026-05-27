/*
<MODULE_CONTRACT>
<purpose>Idempotent DDL migration for core_YYYY.db — the canonical domain registry.</purpose>
<keywords>migration, DDL, core, sites, site_source_seeds, site_cohorts, site_strata</keywords>
<responsibilities>
  <item>Create all core_YYYY.db tables and indexes idempotently (CREATE IF NOT EXISTS).</item>
  <item>Stamp _schema_meta with owner and version after migration.</item>
</responsibilities>
<non-goals>
  <item>Does not seed data — migration only.</item>
  <item>Does not manage pages-YYYY.db schema — see migrate/pages.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="migrateCore">Executes the full DDL migration for core_YYYY.db.</entry>
  <entry key="stampCoreMeta">Writes owner_app and schema_version into _schema_meta.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled CREATE TABLE with refactored modular migration.</item>
  <item>Remove legacy site_pages table from core schema — pages-YYYY.db owns it now.</item>
</CHANGE_SUMMARY>
*/
import type Database from 'better-sqlite3';

/**
 * Idempotent DDL migration for core.db.
 * All tables owned by catalog-harvest and hdri-scoring that form
 * the canonical domain registry.
 *
 * Must be called once before any app reads or writes core.db.
 */
export const migrateCore = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      owner_app     TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      built_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sites (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      domain               TEXT NOT NULL UNIQUE,
      hwo_uid              TEXT,
      hwo_confidence       REAL,
      hwo_provenance       TEXT,
      bundesland           TEXT,
      gemeinde             TEXT,
      created_at           INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sites_domain_idx ON sites(domain);
    CREATE INDEX IF NOT EXISTS sites_hwo_uid_idx ON sites(hwo_uid);

    CREATE TABLE IF NOT EXISTS site_source_seeds (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id           INTEGER NOT NULL,
      source_path       TEXT NOT NULL,
      source_item_key   TEXT NOT NULL,
      business_name     TEXT,
      street_address    TEXT,
      postal_code       TEXT,
      city              TEXT,
      phone             TEXT,
      email             TEXT,
      website_url       TEXT,
      category          TEXT,
      source_profile_url TEXT,
      raw_json          TEXT NOT NULL,
      created_at        INTEGER DEFAULT (unixepoch()),
      UNIQUE(site_id, source_path, source_item_key)
    );
    CREATE INDEX IF NOT EXISTS sss_site_idx   ON site_source_seeds(site_id);
    CREATE INDEX IF NOT EXISTS sss_source_idx ON site_source_seeds(source_path);

    CREATE TABLE IF NOT EXISTS site_cohorts (
      id               TEXT PRIMARY KEY,
      description      TEXT,
      owner_app        TEXT NOT NULL,
      codebook_version TEXT,
      random_seed      TEXT NOT NULL,
      created_at       INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS site_strata (
      cohort_id       TEXT NOT NULL,
      site_id         INTEGER NOT NULL,
      strata_system   TEXT NOT NULL DEFAULT 'destatis_group',
      strata_code     TEXT NOT NULL,
      bundesland      TEXT,
      settlement_type TEXT,
      gemeinde        TEXT,
      PRIMARY KEY (cohort_id, site_id)
    );
    CREATE INDEX IF NOT EXISTS ss_cohort_idx ON site_strata(cohort_id);
    CREATE INDEX IF NOT EXISTS ss_strata_idx ON site_strata(cohort_id, strata_system, strata_code);

    -- DSGVO: consent audit log (subject tokens only — no raw PII)
    CREATE TABLE IF NOT EXISTS consent_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_token    TEXT NOT NULL,
      event_type       TEXT NOT NULL CHECK(event_type IN ('grant','withdraw','update')),
      scope_json       TEXT NOT NULL DEFAULT '[]',
      ip_hash_sha256   TEXT,
      user_agent       TEXT,
      country_code     TEXT,
      recorded_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS ce_token_idx ON consent_events(subject_token);
    CREATE INDEX IF NOT EXISTS ce_type_idx  ON consent_events(event_type);
    CREATE INDEX IF NOT EXISTS ce_time_idx  ON consent_events(recorded_at);

    CREATE TABLE IF NOT EXISTS batch_step_runs (
      batch_id   TEXT NOT NULL,
      step_name  TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      done_at    INTEGER,
      error_msg  TEXT,
      PRIMARY KEY (batch_id, step_name)
    );

    CREATE TABLE IF NOT EXISTS site_step_runs (
      batch_id   TEXT NOT NULL,
      site_id    INTEGER NOT NULL,
      step_name  TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      done_at    INTEGER,
      error_msg  TEXT,
      PRIMARY KEY (batch_id, site_id, step_name)
    );
    CREATE INDEX IF NOT EXISTS ssr_batch_step ON site_step_runs(batch_id, step_name);

    CREATE TABLE IF NOT EXISTS site_hwo_mappings (
      site_id         INTEGER NOT NULL,
      mapping_system  TEXT NOT NULL,
      target_code     TEXT NOT NULL,
      target_label    TEXT,
      source          TEXT NOT NULL,
      created_at      INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (site_id, mapping_system)
    );
    CREATE INDEX IF NOT EXISTS shm_system_idx ON site_hwo_mappings(mapping_system, target_code);
    CREATE INDEX IF NOT EXISTS shm_site_idx ON site_hwo_mappings(site_id);
  `);
};

/**
 * Writes _schema_meta for core.db.
 * Call after migrateCore, once per db lifetime (not idempotent by design —
 * use INSERT OR REPLACE).
 */
export const stampCoreMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(`
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `).run(ownerApp, schemaVersion);
};
