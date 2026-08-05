/*
<MODULE_CONTRACT>
<purpose>This module provides utilities to attach, detach, and hash SQLite databases, ensuring schema compatibility and safe operations.</purpose>
<non-goals>
  <item>This module does not handle the opening or closing of SQLite database connections.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of database attachment, detachment, and hashing functions.</item>
  <item>Fix attachDatabase: replace file: URI with plain path ATTACH + PRAGMA query_only for readonly enforcement.</item>
  <item>Sanitize alias parameter to prevent SQL injection via bracket quoting breakout.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import { assertSchemaCompat } from "./schema/schema-meta.js";
import { hashFile } from "@syrokomskyi/utils";

export { SchemaCompatError } from "./schema/schema-meta.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttachOptions = {
  /** SQL alias used in queries: SELECT * FROM [alias].table_name */
  alias: string;
  /** Absolute path to the SQLite file to attach. */
  path: string;
  /**
   * Expected schema major version (e.g. "v1").
   * Attach will fail if the attached DB's _schema_meta has a different major.
   */
  expectedVersion: string;
  /**
   * If set, also verifies that _schema_meta.owner_app matches this value.
   * Use to prevent accidentally attaching the wrong app's database.
   */
  expectedOwner?: string;
  /** Open in read-only mode. Default: true (safe default for downstream readers). */
  readonly?: boolean;
};

// ---------------------------------------------------------------------------
// attachDatabase
// ---------------------------------------------------------------------------

/**
 * ATTACHes an external SQLite database to an already-open connection,
 * then validates _schema_meta compatibility.
 *
 * Safe defaults:
 *  - readonly = true  (downstream apps must not accidentally write)
 *  - fails fast on version/owner mismatch (SchemaCompatError)
 *
 * Usage:
 *   const db = openCoreSqlite();
 *   attachDatabase(db, { alias: 'liveness', path: liveDbPath,
 *                        expectedVersion: 'v1', expectedOwner: 'site-liveness' });
 *   db.prepare('SELECT * FROM [liveness].site_availability LIMIT 10').all();
 */
const sanitizeAlias = (alias: string): string => alias.replace(/]/g, "]]");

export const attachDatabase = (db: Database.Database, opts: AttachOptions): void => {
  const safePath = opts.path.replace(/'/g, "''");
  const safeAlias = sanitizeAlias(opts.alias);

  db.prepare(`ATTACH DATABASE '${safePath}' AS [${safeAlias}]`).run();

  if (opts.readonly ?? true) {
    db.prepare(`PRAGMA [${safeAlias}].query_only = 1`).run();
  }

  try {
    assertSchemaCompat(db, safeAlias, opts.expectedVersion, opts.expectedOwner);
  } catch (err) {
    // Detach before re-throwing so the caller's db is left in a clean state
    try {
      db.prepare(`DETACH DATABASE [${safeAlias}]`).run();
    } catch {
      /* ignore */
    }
    throw err;
  }
};

/**
 * Detaches a previously attached database alias.
 * Safe to call even if the alias was never attached (swallows error).
 */
export const detachDatabase = (db: Database.Database, alias: string): void => {
  const safeAlias = sanitizeAlias(alias);
  try {
    db.prepare(`DETACH DATABASE [${safeAlias}]`).run();
  } catch {
    // not attached — nothing to do
  }
};

/**
 * Computes the SHA256 hex digest of a SQLite file for provenance tracking.
 * Used by hdri-scoring to stamp pipeline_inputs.snapshot_sha256.
 * @deprecated Import hashFile from @syrokomskyi/utils directly.
 */
export const hashDatabaseFile = (filePath: string): Promise<string> => hashFile(filePath);
