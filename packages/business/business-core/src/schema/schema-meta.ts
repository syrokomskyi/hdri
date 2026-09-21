/*
<MODULE_CONTRACT>
<purpose>This module provides schema metadata management and compatibility checks for SQLite databases using Drizzle ORM.</purpose>
<non-goals>
  <item>This module does not handle database connection management or query execution beyond schema metadata.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of schema metadata management and compatibility checks.</item>
  <item>Fix assertSchemaCompat: add AS aliases to SELECT so better-sqlite3 returns camelCase property names matching SchemaMeta type.</item>
</CHANGE_SUMMARY>
*/

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Table definition (Drizzle)
// ---------------------------------------------------------------------------

export const schemaMeta = sqliteTable("_schema_meta", {
  ownerApp: text("owner_app").notNull(),
  schemaVersion: text("schema_version").notNull(),
  builtAt: integer("built_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SchemaMeta = typeof schemaMeta.$inferSelect;

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

export class SchemaCompatError extends Error {
  constructor(
    public readonly alias: string,
    public readonly reason: string,
  ) {
    super(`Schema compat check failed for "${alias}": ${reason}`);
    this.name = "SchemaCompatError";
  }
}

/**
 * Reads _schema_meta from an already-opened (possibly ATTACH-ed) database and
 * asserts that the version is compatible with the caller's expectation.
 *
 * Version compatibility rule: exact match on major version segment (the part
 * before the first "."). "v1.0" is compatible with "v1.1" but not "v2.0".
 */
export const assertSchemaCompat = (
  db: Database.Database,
  tablePrefix: string,
  expectedVersion: string,
  expectedOwner?: string,
): SchemaMeta => {
  const qualifiedTable = tablePrefix ? `[${tablePrefix}]._schema_meta` : "_schema_meta";

  let meta: SchemaMeta | undefined;
  try {
    meta = db
      .prepare<[], SchemaMeta>(
        `SELECT owner_app AS ownerApp, schema_version AS schemaVersion, built_at AS builtAt FROM ${qualifiedTable} LIMIT 1`,
      )
      .get();
  } catch {
    throw new SchemaCompatError(
      tablePrefix || "main",
      "_schema_meta table not found or not readable",
    );
  }

  if (!meta) {
    throw new SchemaCompatError(tablePrefix || "main", "_schema_meta table is empty");
  }

  if (expectedOwner !== undefined && meta.ownerApp !== expectedOwner) {
    throw new SchemaCompatError(
      tablePrefix || "main",
      `owner mismatch: expected "${expectedOwner}", got "${meta.ownerApp}"`,
    );
  }

  const expectedMajor = majorOf(expectedVersion);
  const actualMajor = majorOf(meta.schemaVersion);
  if (expectedMajor !== actualMajor) {
    throw new SchemaCompatError(
      tablePrefix || "main",
      `version major mismatch: expected major "${expectedMajor}" (from "${expectedVersion}"), got "${meta.schemaVersion}"`,
    );
  }

  return meta;
};

/**
 * Writes (or replaces) _schema_meta for any database.
 * Call after the corresponding migrateXxx function, once per db lifetime.
 */
export const stampSchemaMeta = (
  db: Database.Database,
  ownerApp: string,
  schemaVersion: string,
): void => {
  db.prepare(
    `
    INSERT OR REPLACE INTO _schema_meta (owner_app, schema_version, built_at)
    VALUES (?, ?, unixepoch())
  `,
  ).run(ownerApp, schemaVersion);
};

const majorOf = (version: string): string => version.split(".")[0] ?? version;
