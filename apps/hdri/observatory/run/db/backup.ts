/*
<MODULE_CONTRACT>
<purpose>Take a consistent, standalone backup of the observatory DB before a destructive migration (WP9).</purpose>
<non-goals>
  <item>No off-site copy — this is a local pre-migration safety net; durable archival is snapshot-canonical (WP6).</item>
  <item>No restore logic — the emitted file is a plain SQLite DB the operator can open or copy back.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP9: protective backup taken automatically before any data-losing migration step.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: migrations are idempotent and recorded in the applied_migrations ledger; never skip the backup step

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

/** Escape a filesystem path for use inside a single-quoted SQLite string literal. */
const sqlStringLiteral = (p: string): string => `'${p.replace(/'/g, "''")}'`;

/**
 * Back up `db` before a destructive step.
 *
 * Uses SQLite `VACUUM INTO`, which writes a fresh, fully-compacted database file
 * holding the current committed state — consistent even under WAL, synchronous,
 * and requiring no open transaction. The backup lands in a `backups/` directory
 * beside the live DB file (e.g. `.output/db/backups/`), which is gitignored.
 *
 * @returns absolute path of the backup file, or `null` for an in-memory DB
 *   (`:memory:`) where there is nothing durable to protect.
 */
export const backupDatabase = (db: Database.Database, reason: string): string | null => {
  const source = db.name;
  if (!source || source === ":memory:") return null;

  const backupsDir = path.join(path.dirname(source), "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupsDir, `${path.basename(source)}.${reason}.${stamp}.db`);

  // VACUUM INTO must run outside any open transaction — callers guarantee this.
  db.exec(`VACUUM INTO ${sqlStringLiteral(dest)}`);
  return dest;
};
