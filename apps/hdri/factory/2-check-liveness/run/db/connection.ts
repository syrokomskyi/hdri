/*
<MODULE_CONTRACT>
<purpose>SQLite database connection helpers for the liveness check pipeline — this module handles connection operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage schema migrations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";
import { getLivenessDbPath } from "../paths.js";

/**
 * Opens liveness.db for read-write (creates if missing).
 * Caller is responsible for closing.
 */
export const openLivenessSqlite = (year: number): Database.Database => {
  const db = new Database(getLivenessDbPath(year));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};

/**
 * Opens an arbitrary SQLite file in read-only mode.
 * Used to read registry.db produced by 1-register-businesses without risk of writes.
 */
export const openReadOnlySqlite = (filePath: string): Database.Database => {
  const db = new Database(filePath, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
};
