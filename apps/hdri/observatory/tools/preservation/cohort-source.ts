/*
<MODULE_CONTRACT>
<purpose>Preserve retained cohort definitions and strata membership from authenticated private SQLite snapshots.</purpose>
<non-goals><item>Does not infer quarterly scope, rebuild selection, authenticate methodology or admit a candidate generation.</item></non-goals>
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Read complete cohort and membership tables with bounded transfer and checked references.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: A preserved selection is not proof of quarter or methodology; exhaust every required stream before reconciliation.
import type Database from "better-sqlite3";
import { TextDecoder } from "node:util";
import type { PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot, type SnapshotArtifact } from "./prepared-snapshot.js";

const COHORT_COLUMNS = [
  ["id", "TEXT", 0, 1],
  ["description", "TEXT", 0, 0],
  ["owner_app", "TEXT", 1, 0],
  ["codebook_version", "TEXT", 0, 0],
  ["random_seed", "TEXT", 1, 0],
  ["created_at", "INTEGER", 0, 0],
] as const;
const STRATA_COLUMNS = [
  ["cohort_id", "TEXT", 1, 1],
  ["site_id", "INTEGER", 1, 2],
  ["strata_system", "TEXT", 1, 0],
  ["strata_code", "TEXT", 1, 0],
  ["bundesland", "TEXT", 0, 0],
  ["settlement_type", "TEXT", 0, 0],
  ["gemeinde", "TEXT", 0, 0],
] as const;
type Table = "site_cohorts" | "site_strata";
type ColumnSpec = readonly (readonly [string, "TEXT" | "INTEGER", number, number])[];
type Cell = string | bigint | null;
type CohortColumn = (typeof COHORT_COLUMNS)[number][0];
type StrataColumn = (typeof STRATA_COLUMNS)[number][0];
type Origin = Readonly<{ manifestSha256: string; artifact: SnapshotArtifact }>;
type CohortLocator = Readonly<{ table: "site_cohorts"; id: string }>;
export type RetainedCohort = Readonly<{
  columns: Readonly<Record<CohortColumn, Cell>>;
  source: Origin & Readonly<{ cohortLocator: CohortLocator }>;
}>;
export type RetainedStratum = Readonly<{
  columns: Readonly<Record<StrataColumn, Cell>>;
  source: Origin &
    Readonly<{
      stratumLocator: Readonly<{ table: "site_strata"; cohort_id: string; site_id: string }>;
      cohortLocator: CohortLocator;
      siteLocator: Readonly<{ table: "sites"; id: string }>;
    }>;
}>;
const MAX_ROW_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 100_000_000;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function checkTable(db: Database.Database, table: Table, columns: ColumnSpec): void {
  if (
    db
      .prepare(
        `SELECT count(*) FROM pragma_table_list WHERE schema='main'
    AND name=? AND type='table' AND wr=0 AND ncol=?`,
      )
      .pluck()
      .get(table, columns.length) !== 1
  )
    throw new Error("UNSUPPORTED_COHORT_SOURCE_SCHEMA");
  for (const [name, type, required, pk] of columns) {
    if (
      db
        .prepare(
          `SELECT count(*) FROM pragma_table_xinfo(?) WHERE name=? AND type=?
      AND "notnull"=? AND pk=? AND hidden=0`,
        )
        .pluck()
        .get(table, name, type, required, pk) !== 1
    )
      throw new Error("UNSUPPORTED_COHORT_SOURCE_SCHEMA");
  }
  const index = `sqlite_autoindex_${table}_1`;
  const keys = columns.filter(([, , , pk]) => pk > 0);
  if (
    db
      .prepare(
        `SELECT count(*) FROM pragma_index_list(?) WHERE name=?
    AND origin='pk' AND "unique"=1 AND partial=0`,
      )
      .pluck()
      .get(table, index) !== 1 ||
    db.prepare("SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1").pluck().get(index) !==
      keys.length
  )
    throw new Error("UNSUPPORTED_COHORT_SOURCE_INDEX");
  for (const [name, , , pk] of keys) {
    if (
      db
        .prepare(
          `SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1 AND name=?
      AND seqno=? AND coll='BINARY' AND "desc"=0`,
        )
        .pluck()
        .get(index, name, pk - 1) !== 1
    )
      throw new Error("UNSUPPORTED_COHORT_SOURCE_INDEX");
  }
  if (db.pragma("encoding", { simple: true }) !== "UTF-8")
    throw new Error("UNSUPPORTED_COHORT_SOURCE_ENCODING");
}

// Only authored column specs and fixed SQL tails below enter this helper.
function* readRows(
  db: Database.Database,
  columns: ColumnSpec,
  tail: string,
  links: string,
): Generator<Record<string, Cell>> {
  const bytes = columns.map(([name]) => `coalesce(octet_length(r."${name}"),0)`).join("+");
  const types = columns
    .map(
      ([name, type, required, pk]) =>
        `typeof(r."${name}") IN ('${type === "TEXT" ? "text" : "integer"}'${required || pk ? "" : ",'null'"})`,
    )
    .join(" AND ");
  const guard = `(${bytes})<=${MAX_ROW_BYTES} AND ${types} AND (${links})`;
  const selected = columns
    .map(
      ([name, type]) =>
        `CASE WHEN ${guard} THEN ${type === "TEXT" ? `CAST(r."${name}" AS BLOB)` : `r."${name}"`} END AS "${name}"`,
    )
    .join(",");
  const statement = db
    .prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,${selected} ${tail}`)
    .safeIntegers();
  let count = 0;
  for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
    if (++count > MAX_ROWS) throw new Error("COHORT_SOURCE_ROW_LIMIT");
    if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_COHORT_SOURCE_ROW");
    yield Object.fromEntries(
      columns.map(([name, type]) => {
        const value = raw[name];
        if (value === null) return [name, null];
        if (type === "TEXT" && value instanceof Uint8Array) return [name, utf8.decode(value)];
        if (type === "INTEGER" && typeof value === "bigint") return [name, value];
        throw new Error("INVALID_COHORT_SOURCE_CELL");
      }),
    );
  }
}

/** Includes empty/unreferenced cohorts. Original owner/version/seed are claims,
 * not proof of methodology, device, selection reproducibility or period scope.
 */
export function streamPreparedCohorts(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedCohort> {
  return streamPreparedSnapshot(prepared, snapshotUri, "HARVEST", function* (db, artifact) {
    checkTable(db, "site_cohorts", COHORT_COLUMNS);
    let previous: Buffer | undefined;
    for (const raw of readRows(
      db,
      COHORT_COLUMNS,
      "FROM site_cohorts AS r INDEXED BY sqlite_autoindex_site_cohorts_1 ORDER BY r.id COLLATE BINARY",
      "1",
    )) {
      const columns = raw as Record<CohortColumn, Cell>;
      const id = columns.id as string;
      const key = Buffer.from(id);
      if (previous && Buffer.compare(previous, key) >= 0)
        throw new Error("INVALID_COHORT_SOURCE_ORDER");
      previous = key;
      yield Object.freeze({
        columns: Object.freeze(columns),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          cohortLocator: Object.freeze({ table: "site_cohorts" as const, id }),
        }),
      });
    }
  });
}

/** Includes every membership, not one current cohort. Referenced rows must exist;
 * their full values require separate complete cohort/site scans.
 */
export function streamPreparedStrata(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedStratum> {
  return streamPreparedSnapshot(prepared, snapshotUri, "HARVEST", function* (db, artifact) {
    checkTable(db, "site_cohorts", COHORT_COLUMNS);
    checkTable(db, "site_strata", STRATA_COLUMNS);
    // Check a true rowid alias to keep every site lookup indexed and unambiguous.
    if (
      db
        .prepare(
          `SELECT count(*) FROM pragma_table_list WHERE schema='main' AND name='sites'
      AND type='table' AND wr=0`,
        )
        .pluck()
        .get() !== 1 ||
      db
        .prepare(
          `SELECT count(*) FROM pragma_table_xinfo('sites') WHERE name='id'
      AND type='INTEGER' AND "notnull"=0 AND pk=1 AND hidden=0`,
        )
        .pluck()
        .get() !== 1 ||
      db
        .prepare("SELECT count(*) FROM pragma_index_list('sites') WHERE origin='pk'")
        .pluck()
        .get() !== 0
    )
      throw new Error("UNSUPPORTED_COHORT_SITE_SCHEMA");
    let previous: { cohort: Buffer; site: bigint } | undefined;
    for (const raw of readRows(
      db,
      STRATA_COLUMNS,
      `FROM site_strata AS r INDEXED BY sqlite_autoindex_site_strata_1
      LEFT JOIN site_cohorts AS c INDEXED BY sqlite_autoindex_site_cohorts_1 ON c.id COLLATE BINARY=r.cohort_id
      LEFT JOIN sites AS s ON s.id=r.site_id ORDER BY r.cohort_id COLLATE BINARY,r.site_id`,
      "typeof(c.id)='text' AND typeof(s.id)='integer'",
    )) {
      const columns = raw as Record<StrataColumn, Cell>;
      const cohort = columns.cohort_id as string;
      const site = columns.site_id as bigint;
      const key = Buffer.from(cohort);
      const cmp = previous ? Buffer.compare(previous.cohort, key) : -1;
      if (previous && (cmp > 0 || (cmp === 0 && previous.site >= site)))
        throw new Error("INVALID_COHORT_SOURCE_ORDER");
      previous = { cohort: key, site };
      yield Object.freeze({
        columns: Object.freeze(columns),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          stratumLocator: Object.freeze({
            table: "site_strata" as const,
            cohort_id: cohort,
            site_id: String(site),
          }),
          cohortLocator: Object.freeze({ table: "site_cohorts" as const, id: cohort }),
          siteLocator: Object.freeze({ table: "sites" as const, id: String(site) }),
        }),
      });
    }
  });
}
