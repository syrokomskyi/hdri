/*
<MODULE_CONTRACT>
<purpose>Stream exact retained Observatory pipeline run rows from a verified private snapshot.</purpose>
<non-goals>
  <item>Does not authenticate run provenance, producer device, publication claims or bundle contents.</item>
  <item>Does not infer the current-only codebook_id column, filter runs by period or admit a baseline.</item>
</non-goals>
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: bounded lossless reading of the exact 14-column retained pipeline_runs schema.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Rows are provisional until full exhaustion and final snapshot verification; never read original databases.
import type Database from "better-sqlite3";
import { TextDecoder } from "node:util";
import type { PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot, type SnapshotArtifact } from "./prepared-snapshot.js";

// The retained Q2 pipeline_runs contract: nine original columns plus the five
// historical publication/sync columns. The current-only codebook_id column is
// deliberately absent; readers must not synthesize it.
const COLUMNS = [
  ["run_id", "TEXT", 0, 1],
  ["pipeline_app", "TEXT", 1, 0],
  ["pipeline_version", "TEXT", 1, 0],
  ["period", "TEXT", 1, 0],
  ["ontology_version", "TEXT", 1, 0],
  ["codebook_version", "TEXT", 1, 0],
  ["started_at", "TEXT", 1, 0],
  ["finished_at", "TEXT", 0, 0],
  ["status", "TEXT", 1, 0],
  ["publication_status", "TEXT", 0, 0],
  ["published_at", "TEXT", 0, 0],
  ["supersedes_run_id", "TEXT", 0, 0],
  ["factory_run_id", "TEXT", 0, 0],
  ["bundle_hash", "TEXT", 0, 0],
] as const;
type Column = (typeof COLUMNS)[number][0];
export const RETAINED_RUN_COLUMN_NAMES = COLUMNS.map(([name]) => name);
export type RetainedPipelineRunRow = Readonly<{
  columns: Readonly<Record<Column, string | null>>;
  source: Readonly<{
    manifestSha256: string;
    artifact: SnapshotArtifact;
    runLocator: Readonly<{ table: "pipeline_runs"; run_id: string }>;
  }>;
}>;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const MAX_ROW_BYTES = 8 * 1024 * 1024;
const MAX_KEY_BYTES = 4096;
const MAX_ROWS = 100_000_000;
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });

function checkSchema(db: Database.Database): void {
  const table = db
    .prepare("SELECT type, ncol, wr FROM pragma_table_list WHERE schema='main' AND name=?")
    .get("pipeline_runs") as { type: string; ncol: number; wr: number } | undefined;
  if (!table || table.type !== "table" || table.ncol !== COLUMNS.length || table.wr !== 0)
    throw new Error("UNSUPPORTED_RUN_SOURCE_SCHEMA");
  let index = 0;
  for (const actual of db
    .prepare(
      `SELECT cid, substr(name,1,64) AS name,
    substr(type,1,16) AS type, "notnull", pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid`,
    )
    .iterate("pipeline_runs") as Iterable<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    pk: number;
    hidden: number;
  }>) {
    const expected = COLUMNS[index++];
    if (
      !expected ||
      actual.cid !== index - 1 ||
      actual.name !== expected[0] ||
      actual.type !== expected[1] ||
      actual.notnull !== expected[2] ||
      actual.pk !== expected[3] ||
      actual.hidden !== 0
    )
      throw new Error("UNSUPPORTED_RUN_SOURCE_SCHEMA");
  }
  if (index !== COLUMNS.length) throw new Error("UNSUPPORTED_RUN_SOURCE_SCHEMA");
  // Authored primary-key index name and shape: bounded ordered iteration, no retained SQL execution.
  const name = "sqlite_autoindex_pipeline_runs_1";
  if (
    db
      .prepare(
        `SELECT count(*) FROM pragma_index_list('pipeline_runs')
      WHERE name=? AND origin='pk' AND "unique"=1 AND partial=0`,
      )
      .pluck()
      .get(name) !== 1 ||
    db
      .prepare(
        `SELECT count(*) FROM pragma_index_xinfo(?)
      WHERE key=1 AND seqno=0 AND cid=0 AND name='run_id' AND coll='BINARY' AND "desc"=0`,
      )
      .pluck()
      .get(name) !== 1 ||
    db.prepare("SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1").pluck().get(name) !== 1
  )
    throw new Error("UNSUPPORTED_RUN_SOURCE_INDEX");
  if (db.pragma("encoding", { simple: true }) !== "UTF-8")
    throw new Error("UNSUPPORTED_RUN_SOURCE_ENCODING");
}

function* readRows(db: Database.Database): Generator<RetainedPipelineRunRow["columns"]> {
  // octet_length(column) reads stored length metadata without loading TEXT/BLOB.
  // CASE is lazy. Never filter invalid rows out: emit a tiny sentinel and fail.
  // No SQL identifier or expression comes from caller input or the source DDL.
  const rowBytes = COLUMNS.map(([name]) => `coalesce(octet_length("${name}"),0)`).join("+");
  const types = COLUMNS.map(([name, , required]) => {
    return `typeof("${name}") IN ('text'${required ? "" : ",'null'"})`;
  }).join(" AND ");
  const guard = `(${rowBytes})<=${MAX_ROW_BYTES} AND (${types}) AND typeof(run_id)='text'
    AND octet_length(run_id) BETWEEN 1 AND ${MAX_KEY_BYTES}`;
  const columns = COLUMNS.map(
    ([name]) => `CASE WHEN ${guard} THEN CAST("${name}" AS BLOB) END AS "${name}"`,
  ).join(",");
  const statement = db
    .prepare(
      `SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible, ${columns}
    FROM pipeline_runs INDEXED BY sqlite_autoindex_pipeline_runs_1 ORDER BY run_id COLLATE BINARY`,
    )
    .safeIntegers();
  let count = 0;
  let previous: Buffer | undefined;
  for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
    if (++count > MAX_ROWS) throw new Error("RUN_SOURCE_ROW_LIMIT");
    if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_RUN_SOURCE_ROW");
    const row = Object.fromEntries(
      COLUMNS.map(([name]) => {
        const value = raw[name];
        if (value === null) return [name, null];
        if (!(value instanceof Uint8Array)) throw new Error("INVALID_RUN_SOURCE_CELL");
        return [name, utf8.decode(value)];
      }),
    ) as Record<Column, string | null>;
    const runId = row.run_id as string;
    const key = Buffer.from(runId);
    if (
      !runId.trim() ||
      hasControlCharacter(runId) ||
      (previous && Buffer.compare(previous, key) >= 0)
    )
      throw new Error("INVALID_RUN_SOURCE_KEY");
    previous = key;
    yield Object.freeze(row);
  }
}

/** Complete retained run scan, not a complete observatory export. Every retained
 * run is included, including runs no observation references and runs from other
 * periods stored in the same database. Retained status/publication fields are
 * claims, not authenticated lifecycle proof. Full exhaustion plus the final
 * snapshot rehash is required before any join or comparison can rely on a row.
 */
export function streamPreparedPipelineRuns(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedPipelineRunRow> {
  return streamPreparedSnapshot(prepared, snapshotUri, "OBSERVATION", function* (db, artifact) {
    checkSchema(db);
    for (const columns of readRows(db)) {
      yield Object.freeze({
        columns,
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          runLocator: Object.freeze({
            table: "pipeline_runs" as const,
            run_id: columns.run_id as string,
          }),
        }),
      });
    }
  });
}
