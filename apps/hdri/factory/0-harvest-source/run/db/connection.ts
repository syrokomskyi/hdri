/*
<MODULE_CONTRACT>
<purpose>Manages the opening of the core SQLite database for the catalog-harvest application, ensuring proper configuration for data integrity and performance.</purpose>
<non-goals>
  <item>Do not perform any data manipulation or querying operations.</item>
  <item>Do not manage database connection lifecycle beyond the initial opening.</item>
  <item>Do not handle error logging or reporting related to database operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhanced COMPASS scaffolding to clarify database connection responsibilities and boundaries.</item>
</CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";
import { getCoreDbPath } from "../paths.js";

/**
 * Opens the catalog-harvest core.db with WAL mode.
 * Caller is responsible for closing.
 */
export const openCoreSqlite = (year: number): Database.Database => {
  const db = new Database(getCoreDbPath(year));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};
