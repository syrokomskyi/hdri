/*
<MODULE_CONTRACT>
<purpose>Manages the opening of the core SQLite database for the catalog-harvest application, ensuring proper configuration for data integrity and performance.</purpose>
<keywords>database, sqlite, connection, WAL, integrity</keywords>
<responsibilities>
  <item>Opens the core database with Write-Ahead Logging (WAL) mode for improved concurrency.</item>
  <item>Sets foreign key constraints to maintain referential integrity within the database.</item>
  <item>Provides a direct interface for establishing a database connection, returning a Database instance.</item>
</responsibilities>
<non-goals>
  <item>Do not perform any data manipulation or querying operations.</item>
  <item>Do not manage database connection lifecycle beyond the initial opening.</item>
  <item>Do not handle error logging or reporting related to database operations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="openCoreSqlite">Function to open the core SQLite database.</entry>
  <entry key="getCoreDbPath">Utility to retrieve the database file path.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Enhanced GRACE scaffolding to clarify database connection responsibilities and boundaries.</item>
</CHANGE_SUMMARY>
*/

import Database from 'better-sqlite3';
import { getCoreDbPath } from '../paths.js';

/**
 * Opens the catalog-harvest core.db with WAL mode.
 * Caller is responsible for closing.
 */
export const openCoreSqlite = (year: number): Database.Database => {
  const db = new Database(getCoreDbPath(year));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
};

