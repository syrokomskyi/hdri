import type Database from 'better-sqlite3';
import { assertSchemaCompat } from './schema/schema-meta.js';

export { SchemaCompatError } from './schema/schema-meta.js';

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
export const attachDatabase = (db: Database.Database, opts: AttachOptions): void => {
  const mode = (opts.readonly ?? true) ? 'ro' : 'rwc';
  const safePath = opts.path.replace(/'/g, "''");

  db.prepare(
    `ATTACH DATABASE 'file:${safePath}?mode=${mode}' AS [${opts.alias}]`,
  ).run();

  try {
    assertSchemaCompat(db, opts.alias, opts.expectedVersion, opts.expectedOwner);
  } catch (err) {
    // Detach before re-throwing so the caller's db is left in a clean state
    try { db.prepare(`DETACH DATABASE [${opts.alias}]`).run(); } catch { /* ignore */ }
    throw err;
  }
};

/**
 * Detaches a previously attached database alias.
 * Safe to call even if the alias was never attached (swallows error).
 */
export const detachDatabase = (db: Database.Database, alias: string): void => {
  try {
    db.prepare(`DETACH DATABASE [${alias}]`).run();
  } catch {
    // not attached — nothing to do
  }
};

/**
 * Computes the SHA256 hex digest of a SQLite file for provenance tracking.
 * Used by hdri-scoring to stamp pipeline_inputs.snapshot_sha256.
 */
export const hashDatabaseFile = async (filePath: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  const { createReadStream } = await import('node:fs');

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};
