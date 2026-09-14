/*
<MODULE_CONTRACT>
  <purpose>Read retained Observatory observations from pinned private snapshots with bounded payload transfer.</purpose>
  <non-goals>
    <item>Does not open originals, migrate databases, write records or issue admission receipts.</item>
    <item>Does not authenticate caller-supplied preparation metadata, identities, signatures or referenced CAS objects.</item>
    <item>Does not validate the complete database schema, ontology or historical provenance claims.</item>
  </non-goals>
  <!-- risk: crypto, vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 A1: enforce the known observation-table shape, transfer bounds, exact SQL/JSON agreement and snapshot read-back.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Only consume prepareBaselineSource output in writer-exclusive storage; an accepted row is not a verified archive or completed stream.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import Database from "better-sqlite3";
import { assertRelativeObjectPath, inspectRetainedFile } from "@warpgogol/pipeline-node";
import type { PreparedBaselineSource } from "./preserve.js";
import { hasConsistentObservationEnvelope } from "../../run/verify/verify-core.js";

// Exact table contract retained by Observatory migrations 1–3. Additional database
// domains are intentionally not recognized or executed by this reader.
const COLUMNS = [
  ["id", "TEXT", 0, 1],
  ["asset_id", "TEXT", 1, 0],
  ["signal_path", "TEXT", 1, 0],
  ["ontology_version", "TEXT", 1, 0],
  ["value_bool", "INTEGER", 0, 0],
  ["value_num", "REAL", 0, 0],
  ["value_str", "TEXT", 0, 0],
  ["value_json", "TEXT", 0, 0],
  ["value_type", "TEXT", 1, 0],
  ["observed_at", "TEXT", 1, 0],
  ["recorded_at", "TEXT", 1, 0],
  ["run_id", "TEXT", 1, 0],
  ["evidence_ref", "TEXT", 0, 0],
  ["extractor_version", "TEXT", 0, 0],
  ["confidence", "REAL", 0, 0],
  ["status", "TEXT", 1, 0],
  ["obs_json", "TEXT", 0, 0],
  ["signature", "TEXT", 0, 0],
  ["signed_at", "TEXT", 0, 0],
  ["signing_key_id", "TEXT", 0, 0],
  ["collector_id", "TEXT", 0, 0],
  ["collection_status", "TEXT", 0, 0],
  ["period", "TEXT", 0, 0],
  ["factory_run_id", "TEXT", 0, 0],
  ["crawl_hash", "TEXT", 0, 0],
] as const;
type Column = (typeof COLUMNS)[number][0];
type Cell = string | number | bigint | null;
type PayloadCell = string | number | boolean | null;
export type RetainedObservationSourceRow = Readonly<{
  columns: Readonly<Record<Column, Cell>>;
  /** Flat source payload, not a semantically validated current Observation. */
  payload: Readonly<Record<string, PayloadCell>>;
  /** Exact original obs_json UTF-8 bytes, not a reserialized or target payload hash. */
  payloadSha256: string;
}>;

const MAX_ROW_BYTES = 8 * 1024 * 1024;
const MAX_KEY_BYTES = 4096;
const MAX_ROWS = 100_000_000;
const SIGNING_FIELDS = ["signature", "signed_at", "signing_key_id", "collector_id"] as const;
const MIRRORS = [
  ["id", "observation_id"],
  ["asset_id", "asset_id"],
  ["signal_path", "signal_path"],
  ["value_num", "value_num"],
  ["value_str", "value_str"],
  ["value_json", "value_json"],
  ["value_type", "value_type"],
  ["observed_at", "observed_at"],
  ["recorded_at", "recorded_at"],
  ["evidence_ref", "evidence_ref"],
  ["extractor_version", "probe_version"],
  ["confidence", "confidence"],
  ["status", "status"],
  ["crawl_hash", "crawl_hash"],
] as const;
const PAYLOAD_ONLY = [
  "crawl_id",
  "collector_version",
  "ruleset_version",
  "source_hash",
  "superseded_by",
  "deprecated_reason",
] as const;
const REQUIRED_PAYLOAD = [...MIRRORS.map(([, name]) => name), "value_bool", ...PAYLOAD_ONLY];
const ALLOWED_PAYLOAD = new Set([...REQUIRED_PAYLOAD, "collection_status", ...SIGNING_FIELDS]);
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function checkSchema(db: Database.Database): void {
  const table = db
    .prepare(
      "SELECT type, ncol, wr FROM pragma_table_list WHERE schema='main' AND name='observations'",
    )
    .get() as { type: string; ncol: number; wr: number } | undefined;
  if (!table || table.type !== "table" || table.ncol !== COLUMNS.length || table.wr !== 0)
    throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_SCHEMA");
  let index = 0;
  for (const actual of db
    .prepare(
      `SELECT cid, substr(name,1,64) AS name,
    substr(type,1,16) AS type, "notnull", pk, hidden FROM pragma_table_xinfo('observations') ORDER BY cid`,
    )
    .iterate() as Iterable<{
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
      throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_SCHEMA");
  }
  if (index !== COLUMNS.length) throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_SCHEMA");
  // A known BINARY ascending primary-key index avoids an unbounded temporary sort.
  const pk = db
    .prepare(
      `SELECT count(*) FROM pragma_index_list('observations')
    WHERE name='sqlite_autoindex_observations_1' AND origin='pk' AND "unique"=1 AND partial=0`,
    )
    .pluck()
    .get();
  const key = db
    .prepare(
      `SELECT count(*) FROM pragma_index_xinfo('sqlite_autoindex_observations_1')
    WHERE key=1 AND seqno=0 AND cid=0 AND name='id' AND coll='BINARY' AND "desc"=0`,
    )
    .pluck()
    .get();
  const count = db
    .prepare(
      "SELECT count(*) FROM pragma_index_xinfo('sqlite_autoindex_observations_1') WHERE key=1",
    )
    .pluck()
    .get();
  if (pk !== 1 || key !== 1 || count !== 1) throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_INDEX");
  if (db.pragma("encoding", { simple: true }) !== "UTF-8")
    throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_ENCODING");
}

function readRows(db: Database.Database, period: string): Generator<RetainedObservationSourceRow> {
  // octet_length(column) reads stored length metadata without loading TEXT/BLOB.
  // CASE is lazy. Never filter invalid rows out: emit a tiny sentinel and fail.
  // No SQL identifier or expression comes from caller input or the source DDL.
  const rowBytes = COLUMNS.map(([name]) => `coalesce(octet_length("${name}"),0)`).join("+");
  const types = COLUMNS.map(([name, type, required]) => {
    const accepted =
      type === "TEXT" ? "'text'" : type === "INTEGER" ? "'integer'" : "'real','integer'";
    return `typeof("${name}") IN (${accepted}${required ? "" : ",'null'"})`;
  }).join(" AND ");
  const guard = `(${rowBytes})<=${MAX_ROW_BYTES} AND (${types}) AND typeof(id)='text'
    AND octet_length(id) BETWEEN 1 AND ${MAX_KEY_BYTES} AND typeof(obs_json)='text'`;
  const columns = COLUMNS.map(
    ([name, type]) =>
      `CASE WHEN ${guard} THEN ${type === "TEXT" ? `CAST("${name}" AS BLOB)` : `"${name}"`} END AS "${name}"`,
  ).join(",");
  const statement = db
    .prepare(
      `SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible, ${columns}
    FROM observations INDEXED BY sqlite_autoindex_observations_1 ORDER BY id COLLATE BINARY`,
    )
    .safeIntegers();
  const duplicateKeys = db
    .prepare("SELECT count(*) <> count(DISTINCT key) FROM json_each(?)")
    .pluck();
  return (function* () {
    let count = 0;
    let previous: Buffer | undefined;
    for (const raw of statement.iterate() as Iterable<Record<string, unknown>>) {
      if (++count > MAX_ROWS) throw new Error("OBSERVATION_SOURCE_ROW_LIMIT");
      if (raw.admissible !== 1n) throw new Error("INVALID_OR_OVERSIZED_OBSERVATION_SOURCE_ROW");
      const row = Object.fromEntries(
        COLUMNS.map(([name, type]) => {
          const value = raw[name];
          if (type === "TEXT" && value !== null) {
            if (!(value instanceof Uint8Array)) throw new Error("INVALID_OBSERVATION_SOURCE_TEXT");
            return [name, utf8.decode(value)];
          }
          if (value !== null && typeof value !== "number" && typeof value !== "bigint")
            throw new Error("INVALID_OBSERVATION_SOURCE_NUMBER");
          if (typeof value === "number" && !Number.isFinite(value))
            throw new Error("INVALID_OBSERVATION_SOURCE_NUMBER");
          return [name, value];
        }),
      ) as Record<Column, Cell>;
      const id = row.id as string;
      const key = Buffer.from(id);
      if (
        !id.trim() ||
        /[\u0000-\u001f\u007f]/.test(id) ||
        (previous && Buffer.compare(previous, key) >= 0)
      )
        throw new Error("INVALID_OBSERVATION_SOURCE_KEY");
      previous = key;
      if (row.period !== period) throw new Error("OBSERVATION_SOURCE_PERIOD_MISMATCH");
      const json = row.obs_json as string;
      const payload: unknown = JSON.parse(json);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("INVALID_OBSERVATION_SOURCE_JSON");
      if (duplicateKeys.get(json) !== 0) throw new Error("DUPLICATE_OBSERVATION_SOURCE_JSON_KEY");
      const object = payload as Record<string, unknown>;
      if (
        REQUIRED_PAYLOAD.some((name) => !Object.hasOwn(object, name)) ||
        Object.entries(object).some(
          ([name, value]) =>
            !ALLOWED_PAYLOAD.has(name) ||
            (value !== null && !["string", "number", "boolean"].includes(typeof value)),
        )
      )
        throw new Error("UNSUPPORTED_OBSERVATION_SOURCE_PAYLOAD");
      for (const [column, field] of MIRRORS)
        if (!Object.is(row[column], object[field]))
          throw new Error(`OBSERVATION_SOURCE_MISMATCH: ${column}`);
      if (row.value_bool !== null && row.value_bool !== 0n && row.value_bool !== 1n)
        throw new Error("INVALID_OBSERVATION_SOURCE_BOOLEAN");
      if ((row.value_bool === null ? null : row.value_bool === 1n) !== object.value_bool)
        throw new Error("OBSERVATION_SOURCE_MISMATCH: value_bool");
      if (
        row.collection_status !==
        (Object.hasOwn(object, "collection_status") ? object.collection_status : null)
      )
        throw new Error("OBSERVATION_SOURCE_MISMATCH: collection_status");
      if (!hasConsistentObservationEnvelope(row, object))
        throw new Error("OBSERVATION_SOURCE_SIGNING_MISMATCH");
      yield Object.freeze({
        columns: Object.freeze(row),
        payload: Object.freeze(object) as Readonly<Record<string, PayloadCell>>,
        payloadSha256: createHash("sha256").update(json).digest("hex"),
      });
    }
  })();
}

/**
 * Internal reader: prepared must come directly from prepareBaselineSource, not JSON
 * or a caller-asserted manifest. It is metadata, not an admission brand. Only this
 * table is covered. Full exhaustion plus final reread is needed; early return closes
 * resources and rereads bytes but cannot establish domain completeness.
 */
export function streamPreparedObservations(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedObservationSourceRow> {
  assertRelativeObjectPath(snapshotUri);
  const matches = prepared.manifest.artifacts.filter((artifact) => artifact.uri === snapshotUri);
  if (matches.length !== 1 || matches[0].representation !== "sqlite-snapshot")
    throw new Error("DECLARED_OBSERVATION_SNAPSHOT_REQUIRED");
  const expected = { ...matches[0] };
  const file = path.join(prepared.root, snapshotUri);
  const period = prepared.manifest.period;
  async function verifyBytes() {
    let header = Buffer.alloc(0);
    const actual = await inspectRetainedFile(file, (chunk) => {
      if (header.length < 20)
        header = Buffer.concat([header, chunk.subarray(0, 20 - header.length)]);
    });
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
      throw new Error("OBSERVATION_SNAPSHOT_CHANGED");
    if (
      actual.bytes < 100 ||
      header.subarray(0, 16).toString("binary") !== "SQLite format 3\0" ||
      header[18] !== 1 ||
      header[19] !== 1
    )
      throw new Error("STANDALONE_OBSERVATION_SNAPSHOT_REQUIRED");
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      try {
        await fs.lstat(file + suffix);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      throw new Error("OBSERVATION_SNAPSHOT_SIDECAR");
    }
  }
  return (async function* () {
    await verifyBytes();
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      db.pragma("query_only=ON");
      db.pragma("trusted_schema=OFF");
      checkSchema(db);
      yield* readRows(db, period);
    } finally {
      try {
        db.close();
      } finally {
        await verifyBytes();
      }
    }
  })();
}
