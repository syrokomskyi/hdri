/*
<MODULE_CONTRACT>
<purpose>Opens the observatory SQLite database.</purpose>
<keywords>database, sqlite, connection</keywords>
<responsibilities>
  <item>Opens observatory.db with WAL mode and foreign keys.</item>
  <item>Provides path helpers for the observatory DB directory.</item>
</responsibilities>
<non-goals>
  <item>Do not manage connection lifecycle beyond opening.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="openObservatoryDb">Opens observatory.db.</entry>
  <entry key="getObservatoryDbPath">Returns the path to observatory.db.</entry>
  <entry key="getDbDir">Returns the DB directory path.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import Database from 'better-sqlite3';
import { outputRootDir } from '../config';

export const getDbDir = (): string =>
  path.join(outputRootDir, 'db');

export const getObservatoryDbPath = (year: number): string =>
  path.join(getDbDir(), `observatory_${year}.db`);

export const openObservatoryDb = (year: number): Database.Database => {
  const db = new Database(getObservatoryDbPath(year));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
};
