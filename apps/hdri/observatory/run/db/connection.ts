/*
<MODULE_CONTRACT>
<purpose>Opens the observatory SQLite database — this module handles connection operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage connection lifecycle beyond opening.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
  <item>WP8: target-aware DB dir — OBSERVATORY_DB_TARGET=staging routes the whole run to .output/db/staging so publication is gated behind a separate promotion step.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import Database from "better-sqlite3";
import { outputRootDir } from "../config";

/** Env var selecting the active DB directory for the whole process. */
export const DB_TARGET_ENV = "OBSERVATORY_DB_TARGET";

/** Canonical, published DB directory — what the dashboard export reads. */
export const getCanonicalDbDir = (): string => path.join(outputRootDir, "db");

/** Ephemeral staging DB directory — a working copy validated before promotion. */
export const getStagingDbDir = (): string => path.join(outputRootDir, "db", "staging");

/**
 * The DB directory the current process operates on. Defaults to canonical, but a
 * pipeline run sets OBSERVATORY_DB_TARGET=staging so every gogol writes to the
 * staging copy; nothing reaches canonical until `promote-to-canonical` validates it.
 */
export const getDbDir = (): string =>
  process.env[DB_TARGET_ENV] === "staging" ? getStagingDbDir() : getCanonicalDbDir();

export const getObservatoryDbPath = (year: number): string =>
  path.join(getDbDir(), `observatory_${year}.db`);

export const openObservatoryDb = (year: number): Database.Database => {
  const db = new Database(getObservatoryDbPath(year));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};
