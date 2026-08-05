/*
<MODULE_CONTRACT>
<purpose>SQLite database connection helpers for the lighthouse audit pipeline — this module handles connection operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage schema migrations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
  <item>Rename openLighthouseSqlite to openAuditsDb for gogol compatibility.</item>
</CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";

export const openAuditsDb = (dbPath?: string): Database.Database => {
  if (!dbPath) throw new Error("Quarter-scoped Lighthouse database path is required");
  const resolvedPath = dbPath;
  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};

export const openReadOnlySqlite = (filePath: string): Database.Database => {
  const db = new Database(filePath, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
};

/**
 * Opens registry.db read-only. site-deep-audit reads sites table
 * from 1-register-businesses but never writes there.
 */
export const openRegistryDbReadOnly = (registryDbPath: string): Database.Database =>
  new Database(registryDbPath, { readonly: true });

/**
 * Opens liveness.db read-only.
 * Used to filter audit targets to only live sites (is_live = 1).
 */
export const openLivenessDbReadOnly = (livenessDbPath: string): Database.Database =>
  new Database(livenessDbPath, { readonly: true });
