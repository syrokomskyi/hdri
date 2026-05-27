/*
<MODULE_CONTRACT>
<purpose>SQLite database connection helpers for the axe audit pipeline.</purpose>
<keywords>database, sqlite, connection</keywords>
<responsibilities>
  <item>Opens audits.db for read-write operations.</item>
  <item>Opens arbitrary SQLite files in read-only mode.</item>
  <item>Opens registry.db read-only for querying live sites.</item>
</responsibilities>
<non-goals>
  <item>Do not manage schema migrations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="openAuditsDb">Opens audits.db for read-write.</entry>
  <entry key="openReadOnlySqlite">Opens an arbitrary SQLite file read-only.</entry>
  <entry key="openRegistryDbReadOnly">Opens registry.db read-only.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
  <item>Rename openAxeSqlite to openAuditsDb for gogol compatibility.</item>
</CHANGE_SUMMARY>
*/

import Database from 'better-sqlite3';
import { getAuditsDbPath } from '../paths.js';

export const openAuditsDb = (dbPath?: string): Database.Database => {
  const resolvedPath = dbPath ?? getAuditsDbPath(new Date().getFullYear());
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
};

export const openReadOnlySqlite = (filePath: string): Database.Database => {
  const db = new Database(filePath, { readonly: true });
  db.pragma('journal_mode = WAL');
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

