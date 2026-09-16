/*
<MODULE_CONTRACT>
<purpose>Stream exact retained business seeds and site records from a verified private snapshot.</purpose>
<non-goals><item>Does not export cohort tables, reinterpret classifications, infer canonical identities or authorize inheritance.</item></non-goals>
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>Add bounded lossless seed reading for the preserved baseline conversion boundary.</item>
<item>Read every retained site, including unreferenced sites and original classification fields.</item>
<item>Preserve every retained HWO mapping with composite identity and checked site references.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Rows are provisional until full exhaustion and final snapshot verification; never read original databases.
import type Database from "better-sqlite3";
import { TextDecoder } from "node:util";
import type { PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot, type SnapshotArtifact } from "./prepared-snapshot.js";

const COLUMNS = [
  ["id", "INTEGER", 0, 1],
  ["site_id", "INTEGER", 1, 0],
  ["source_path", "TEXT", 1, 0],
  ["source_item_key", "TEXT", 1, 0],
  ["business_name", "TEXT", 0, 0],
  ["street_address", "TEXT", 0, 0],
  ["postal_code", "TEXT", 0, 0],
  ["city", "TEXT", 0, 0],
  ["phone", "TEXT", 0, 0],
  ["email", "TEXT", 0, 0],
  ["website_url", "TEXT", 0, 0],
  ["category", "TEXT", 0, 0],
  ["source_profile_url", "TEXT", 0, 0],
  ["raw_json", "TEXT", 1, 0],
  ["created_at", "INTEGER", 0, 0],
] as const;
type Column = (typeof COLUMNS)[number][0];
export type RetainedHarvestSeed = Readonly<{
  columns: Readonly<Record<Column, string | bigint | null>>;
  domain: string;
  source: Readonly<{
    manifestSha256: string;
    artifact: SnapshotArtifact;
    seedLocator: Readonly<{ table: "site_source_seeds"; id: string }>;
    siteLocator: Readonly<{ table: "sites"; id: string }>;
  }>;
}>;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const MAX_ROW_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 100_000_000;
const SITE_COLUMNS = [
  ["id", "INTEGER", 0, 1],
  ["domain", "TEXT", 1, 0],
  ["hwo_uid", "TEXT", 0, 0],
  ["hwo_confidence", "REAL", 0, 0],
  ["hwo_provenance", "TEXT", 0, 0],
  ["bundesland", "TEXT", 0, 0],
  ["gemeinde", "TEXT", 0, 0],
  ["created_at", "INTEGER", 0, 0],
] as const;
const MAPPING_COLUMNS = [
  ["site_id", "INTEGER", 1, 1],
  ["mapping_system", "TEXT", 1, 2],
  ["target_code", "TEXT", 1, 0],
  ["target_label", "TEXT", 0, 0],
  ["source", "TEXT", 1, 0],
  ["created_at", "INTEGER", 0, 0],
] as const;
type MappingColumn = (typeof MAPPING_COLUMNS)[number][0];
export type RetainedHarvestMapping = Readonly<{
  columns: Readonly<Record<MappingColumn, string | bigint | null>>;
  source: Readonly<{
    manifestSha256: string;
    artifact: SnapshotArtifact;
    mappingLocator: Readonly<{
      table: "site_hwo_mappings";
      site_id: string;
      mapping_system: string;
    }>;
    siteLocator: Readonly<{ table: "sites"; id: string }>;
  }>;
}>;
type SiteColumn = (typeof SITE_COLUMNS)[number][0];
export type RetainedHarvestSite = Readonly<{
  columns: Readonly<Record<SiteColumn, string | bigint | number | null>>;
  source: Readonly<{
    manifestSha256: string;
    artifact: SnapshotArtifact;
    siteLocator: Readonly<{ table: "sites"; id: string }>;
  }>;
}>;

function checkSchema(db: Database.Database, completeSites = false): void {
  for (const name of completeSites
    ? (["sites"] as const)
    : (["site_source_seeds", "sites"] as const)) {
    const table = db
      .prepare("SELECT type, ncol, wr FROM pragma_table_list WHERE schema='main' AND name=?")
      .get(name) as { type: string; ncol: number; wr: number } | undefined;
    if (
      !table ||
      table.type !== "table" ||
      table.wr !== 0 ||
      (name === "site_source_seeds" && table.ncol !== COLUMNS.length) ||
      (completeSites && table.ncol !== SITE_COLUMNS.length)
    )
      throw new Error("UNSUPPORTED_HARVEST_SOURCE_SCHEMA");
    const expected =
      name === "site_source_seeds"
        ? COLUMNS
        : completeSites
          ? SITE_COLUMNS
          : ([
              ["id", "INTEGER", 0, 1],
              ["domain", "TEXT", 1, 0],
            ] as const);
    for (const [column, type, required, pk] of expected) {
      const valid = db
        .prepare(
          `SELECT count(*) FROM pragma_table_xinfo(?)
        WHERE name=? AND type=? AND "notnull"=? AND pk=? AND hidden=0`,
        )
        .pluck()
        .get(name, column, type, required, pk);
      if (valid !== 1) throw new Error("UNSUPPORTED_HARVEST_SOURCE_SCHEMA");
    }
    // INTEGER PRIMARY KEY DESC can be an ordinary nullable indexed column, not a rowid alias.
    if (
      db
        .prepare("SELECT count(*) FROM pragma_index_list(?) WHERE origin='pk'")
        .pluck()
        .get(name) !== 0
    )
      throw new Error("UNSUPPORTED_HARVEST_SOURCE_SCHEMA");
  }
  if (db.pragma("encoding", { simple: true }) !== "UTF-8")
    throw new Error("UNSUPPORTED_HARVEST_SOURCE_ENCODING");
}

/** Complete sites-table scan, not a complete harvest export. Historical classification
 * values are retained claims, not authenticated derivations. Missingness stays null.
 * Sites without seeds are included; seeds and normalized mappings need separate scans.
 */
export function streamPreparedHarvestSites(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedHarvestSite> {
  return streamPreparedSnapshot(prepared, snapshotUri, "HARVEST", function* (db, artifact) {
    checkSchema(db, true);
    const bytes = SITE_COLUMNS.map(([name]) => `coalesce(octet_length("${name}"),0)`).join("+");
    const types = SITE_COLUMNS.map(([name, type, required, pk]) => {
      const accepted =
        type === "TEXT" ? "'text'" : type === "REAL" ? "'real','integer'" : "'integer'";
      return `typeof("${name}") IN (${accepted}${required || pk ? "" : ",'null'"})`;
    }).join(" AND ");
    const guard = `(${bytes})<=${MAX_ROW_BYTES} AND ${types}`;
    const selected = SITE_COLUMNS.map(
      ([name, type]) =>
        `CASE WHEN ${guard} THEN ${type === "TEXT" ? `CAST("${name}" AS BLOB)` : `"${name}"`} END AS "${name}"`,
    ).join(",");
    const statement = db
      .prepare(
        `SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,
      ${selected} FROM sites NOT INDEXED ORDER BY id`,
      )
      .safeIntegers();
    let count = 0;
    let previous: bigint | undefined;
    for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
      if (++count > MAX_ROWS) throw new Error("HARVEST_SITE_ROW_LIMIT");
      if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_HARVEST_SITE_ROW");
      const columns = Object.fromEntries(
        SITE_COLUMNS.map(([name, type]) => {
          const value = raw[name];
          if (value === null) return [name, null];
          if (type === "TEXT" && value instanceof Uint8Array) return [name, utf8.decode(value)];
          if (type === "INTEGER" && typeof value === "bigint") return [name, value];
          if (type === "REAL" && typeof value === "number" && Number.isFinite(value))
            return [name, value];
          throw new Error("INVALID_HARVEST_SITE_CELL");
        }),
      ) as Record<SiteColumn, string | number | bigint | null>;
      const id = columns.id as bigint;
      if (previous !== undefined && id <= previous) throw new Error("INVALID_HARVEST_SITE_ORDER");
      previous = id;
      yield Object.freeze({
        columns: Object.freeze(columns),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          siteLocator: Object.freeze({ table: "sites" as const, id: String(id) }),
        }),
      });
    }
  });
}

/** Only the seed table plus joined domain is exported, not the complete sites table.
 * Raw JSON remains opaque original text. Local IDs are not canonical asset IDs.
 * Requires writer-exclusive prepared storage and complete consumption before admission.
 */
export function streamPreparedHarvestSeeds(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedHarvestSeed> {
  return streamPreparedSnapshot(prepared, snapshotUri, "HARVEST", function* (db, artifact) {
    checkSchema(db);
    const bytes = [
      ...COLUMNS.map(([name]) => `coalesce(octet_length(s."${name}"),0)`),
      "coalesce(octet_length(p.domain),0)",
    ].join("+");
    const types = COLUMNS.map(
      ([name, type, required, pk]) =>
        `typeof(s."${name}") IN ('${type === "TEXT" ? "text" : "integer"}'${required || pk ? "" : ",'null'"})`,
    ).join(" AND ");
    const guard = `(${bytes})<=${MAX_ROW_BYTES} AND ${types} AND typeof(p.domain)='text' AND typeof(p.id)='integer'`;
    const selected = COLUMNS.map(
      ([name, type]) =>
        `CASE WHEN ${guard} THEN ${type === "TEXT" ? `CAST(s."${name}" AS BLOB)` : `s."${name}"`} END AS "${name}"`,
    ).join(",");
    // Rowid traversal + one rowid lookup per seed: no full-table sort, no domain deduplication.
    const statement = db
      .prepare(
        `SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,
      ${selected}, CASE WHEN ${guard} THEN CAST(p.domain AS BLOB) END AS domain
      FROM site_source_seeds AS s NOT INDEXED LEFT JOIN sites AS p ON p.id=s.site_id ORDER BY s.id`,
      )
      .safeIntegers();
    let count = 0;
    let previous: bigint | undefined;
    for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
      if (++count > MAX_ROWS) throw new Error("HARVEST_SOURCE_ROW_LIMIT");
      if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_HARVEST_SOURCE_ROW");
      const columns = Object.fromEntries(
        COLUMNS.map(([name, type]) => {
          const value = raw[name];
          if (value === null) return [name, null];
          if (type === "TEXT" && value instanceof Uint8Array) return [name, utf8.decode(value)];
          if (type === "INTEGER" && typeof value === "bigint") return [name, value];
          throw new Error("INVALID_HARVEST_SOURCE_CELL");
        }),
      ) as Record<Column, string | bigint | null>;
      const id = columns.id as bigint;
      if (previous !== undefined && id <= previous) throw new Error("INVALID_HARVEST_SOURCE_ORDER");
      previous = id;
      if (!(raw.domain instanceof Uint8Array)) throw new Error("INVALID_HARVEST_SOURCE_DOMAIN");
      yield Object.freeze({
        columns: Object.freeze(columns),
        domain: utf8.decode(raw.domain),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          seedLocator: Object.freeze({ table: "site_source_seeds" as const, id: String(id) }),
          siteLocator: Object.freeze({ table: "sites" as const, id: String(columns.site_id) }),
        }),
      });
    }
  });
}

/** Preserve every mapping system, not just today's Destatis interpretation.
 * Referenced sites must exist; their field values require the separate full site scan.
 * Missing mappings are not synthesized. Full exhaustion and independent reconciliation
 * remain required before any candidate generation can be admitted.
 */
export function streamPreparedHarvestMappings(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedHarvestMapping> {
  return streamPreparedSnapshot(prepared, snapshotUri, "HARVEST", function* (db, artifact) {
    checkSchema(db, true);
    const table = db
      .prepare(
        `SELECT count(*) FROM pragma_table_list WHERE schema='main'
      AND name='site_hwo_mappings' AND type='table' AND ncol=6 AND wr=0`,
      )
      .pluck()
      .get();
    if (table !== 1) throw new Error("UNSUPPORTED_HARVEST_MAPPING_SCHEMA");
    for (const [name, type, required, pk] of MAPPING_COLUMNS) {
      if (
        db
          .prepare(
            `SELECT count(*) FROM pragma_table_xinfo('site_hwo_mappings')
        WHERE name=? AND type=? AND "notnull"=? AND pk=? AND hidden=0`,
          )
          .pluck()
          .get(name, type, required, pk) !== 1
      )
        throw new Error("UNSUPPORTED_HARVEST_MAPPING_SCHEMA");
    }
    // Authored index name and shape: bounded ordered iteration, no retained SQL execution.
    const index = "sqlite_autoindex_site_hwo_mappings_1";
    if (
      db
        .prepare(
          `SELECT count(*) FROM pragma_index_list('site_hwo_mappings')
      WHERE name=? AND origin='pk' AND "unique"=1 AND partial=0`,
        )
        .pluck()
        .get(index) !== 1 ||
      db.prepare("SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1").pluck().get(index) !== 2
    )
      throw new Error("UNSUPPORTED_HARVEST_MAPPING_INDEX");
    for (const [seqno, name] of [
      [0, "site_id"],
      [1, "mapping_system"],
    ] as const) {
      if (
        db
          .prepare(
            `SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1
        AND seqno=? AND name=? AND coll='BINARY' AND "desc"=0`,
          )
          .pluck()
          .get(index, seqno, name) !== 1
      )
        throw new Error("UNSUPPORTED_HARVEST_MAPPING_INDEX");
    }
    const bytes = MAPPING_COLUMNS.map(([name]) => `coalesce(octet_length(m."${name}"),0)`).join(
      "+",
    );
    const types = MAPPING_COLUMNS.map(
      ([name, type, required]) =>
        `typeof(m."${name}") IN ('${type === "TEXT" ? "text" : "integer"}'${required ? "" : ",'null'"})`,
    ).join(" AND ");
    const guard = `(${bytes})<=${MAX_ROW_BYTES} AND ${types} AND typeof(p.id)='integer'`;
    const selected = MAPPING_COLUMNS.map(
      ([name, type]) =>
        `CASE WHEN ${guard} THEN ${type === "TEXT" ? `CAST(m."${name}" AS BLOB)` : `m."${name}"`} END AS "${name}"`,
    ).join(",");
    const statement = db
      .prepare(
        `SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,
      ${selected} FROM site_hwo_mappings AS m INDEXED BY ${index}
      LEFT JOIN sites AS p ON p.id=m.site_id ORDER BY m.site_id,m.mapping_system COLLATE BINARY`,
      )
      .safeIntegers();
    let count = 0;
    let previous: { site: bigint; system: Buffer } | undefined;
    for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
      if (++count > MAX_ROWS) throw new Error("HARVEST_MAPPING_ROW_LIMIT");
      if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_HARVEST_MAPPING_ROW");
      const columns = Object.fromEntries(
        MAPPING_COLUMNS.map(([name, type]) => {
          const value = raw[name];
          if (value === null) return [name, null];
          if (type === "TEXT" && value instanceof Uint8Array) return [name, utf8.decode(value)];
          if (type === "INTEGER" && typeof value === "bigint") return [name, value];
          throw new Error("INVALID_HARVEST_MAPPING_CELL");
        }),
      ) as Record<MappingColumn, string | bigint | null>;
      const site = columns.site_id as bigint;
      const system = columns.mapping_system as string;
      const key = Buffer.from(system);
      if (
        previous &&
        (site < previous.site ||
          (site === previous.site && Buffer.compare(previous.system, key) >= 0))
      )
        throw new Error("INVALID_HARVEST_MAPPING_ORDER");
      previous = { site, system: key };
      yield Object.freeze({
        columns: Object.freeze(columns),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          mappingLocator: Object.freeze({
            table: "site_hwo_mappings" as const,
            site_id: String(site),
            mapping_system: system,
          }),
          siteLocator: Object.freeze({ table: "sites" as const, id: String(site) }),
        }),
      });
    }
  });
}
