/*
<MODULE_CONTRACT>
<purpose>Database connection helpers for site-profile — this module handles connection operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage schema migrations — that is handled by SetupProfileDbGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Remove openRegistryDbReadWrite; site-profile no longer writes to upstream registry.db.</item>
</CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";

/**
 * Opens pages_YYYY.db for read-write (creates if missing).
 * site-profile owns page_contents, page_observations, site_pages, and all ext_* tables.
 */
export const openPagesDb = (pagesDbPath: string): Database.Database => {
  const db = new Database(pagesDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};

/**
 * Opens any SQLite file in read-only mode.
 * Used for liveness.db (owned by site-liveness) and registry.db (owned by register-businesses).
 * site-profile never writes to upstream databases.
 */
export const openReadOnlyDb = (dbPath: string): Database.Database =>
  new Database(dbPath, { readonly: true });
