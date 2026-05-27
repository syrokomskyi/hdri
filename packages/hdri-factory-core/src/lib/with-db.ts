import type Database from 'better-sqlite3';

export async function withDb<T>(
  open: () => Database.Database,
  fn: (db: Database.Database) => T,
): Promise<T> {
  const db = open();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
