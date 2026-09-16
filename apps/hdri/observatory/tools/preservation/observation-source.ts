/*
<MODULE_CONTRACT>
  <purpose>Read retained Observatory observations from pinned private snapshots with bounded payload transfer.</purpose>
  <non-goals>
    <item>Does not open originals, migrate databases, write records or issue admission receipts.</item>
    <item>Does not accept reconstructed preparation metadata or authenticate historical device claims, signatures or referenced CAS objects.</item>
    <item>Does not validate the complete database schema, ontology or historical provenance claims.</item>
  </non-goals>
  <!-- risk: crypto, vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: enforce the known observation-table shape, transfer bounds, exact SQL/JSON agreement and snapshot read-back.</item>
  <item>Join retained identity mappings in the same pinned snapshot using an explicit identifier namespace and bounded indexed lookups.</item>
  <item>Share private snapshot I/O with the harvest reader while retaining observation-specific schema validation.</item>
  <item>Stream the complete retained identity map, including rows unreferenced by observations.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Only consume prepareBaselineSource output in writer-exclusive storage; an accepted row is not a verified archive or completed stream.
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import Database from "better-sqlite3";
import type { PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot } from "./prepared-snapshot.js";
import { hasConsistentObservationEnvelope } from "../../run/verify/verify-core.js";
import { assertBaselineCanonicalId } from "./contracts.js";

// Exact observation table contract retained by Observatory migrations 1–3.
// Identity joins below recognize one additional, explicitly declared table.
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
export const RETAINED_OBSERVATION_COLUMN_NAMES = Object.freeze(
  COLUMNS.map(([name]) => name),
) as readonly Column[];
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
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });

// These schemas and index names are authored constants, never retained SQL or caller input.
const IDENTITY_COLUMNS = [
  ["provisional_id", "TEXT", 0, 1],
  ["canonical_id", "TEXT", 1, 0],
  ["domain", "TEXT", 1, 0],
  ["first_seen", "TEXT", 1, 0],
] as const;
type IdentityColumn = (typeof IDENTITY_COLUMNS)[number][0];
export type RetainedObservationIdentity = Readonly<{
  observation: RetainedObservationSourceRow;
  identity: Readonly<Record<IdentityColumn, string>>;
  source: Readonly<{
    manifestSha256: string;
    artifact: Readonly<{ uri: string; sha256: string; bytes: number }>;
    observationLocator: Readonly<{ table: "observations"; id: string }>;
    identityLocator: Readonly<{ table: "asset_id_map"; provisional_id: string }>;
    assetIdNamespace: "provisional" | "canonical";
  }>;
}>;
export type RetainedObservationIdentityMapRow = Readonly<{
  identity: Readonly<Record<IdentityColumn, string>>;
  source: Readonly<{
    manifestSha256: string;
    artifact: Readonly<{ uri: string; sha256: string; bytes: number }>;
    identityLocator: Readonly<{ table: "asset_id_map"; provisional_id: string }>;
  }>;
}>;

function checkTableSchema(
  db: Database.Database,
  name: "observations" | "asset_id_map",
  columns: readonly (readonly [string, string, number, number])[],
): void {
  const error =
    name === "observations"
      ? "UNSUPPORTED_OBSERVATION_SOURCE_SCHEMA"
      : "UNSUPPORTED_IDENTITY_SOURCE_SCHEMA";
  const table = db
    .prepare("SELECT type, ncol, wr FROM pragma_table_list WHERE schema='main' AND name=?")
    .get(name) as { type: string; ncol: number; wr: number } | undefined;
  if (!table || table.type !== "table" || table.ncol !== columns.length || table.wr !== 0)
    throw new Error(error);
  let index = 0;
  for (const actual of db
    .prepare(
      `SELECT cid, substr(name,1,64) AS name,
    substr(type,1,16) AS type, "notnull", pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid`,
    )
    .iterate(name) as Iterable<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    pk: number;
    hidden: number;
  }>) {
    const expected = columns[index++];
    if (
      !expected ||
      actual.cid !== index - 1 ||
      actual.name !== expected[0] ||
      actual.type !== expected[1] ||
      actual.notnull !== expected[2] ||
      actual.pk !== expected[3] ||
      actual.hidden !== 0
    )
      throw new Error(error);
  }
  if (index !== columns.length) throw new Error(error);
}

function checkUniqueIndex(
  db: Database.Database,
  table: "observations" | "asset_id_map",
  name: string,
  column: string,
  cid: number,
  origin: "pk" | "c",
): void {
  const index = db
    .prepare(
      `SELECT count(*) FROM pragma_index_list(?)
      WHERE name=? AND origin=? AND "unique"=1 AND partial=0`,
    )
    .pluck()
    .get(table, name, origin);
  const key = db
    .prepare(
      `SELECT count(*) FROM pragma_index_xinfo(?)
      WHERE key=1 AND seqno=0 AND cid=? AND name=? AND coll='BINARY' AND "desc"=0`,
    )
    .pluck()
    .get(name, cid, column);
  const count = db
    .prepare("SELECT count(*) FROM pragma_index_xinfo(?) WHERE key=1")
    .pluck()
    .get(name);
  if (index !== 1 || key !== 1 || count !== 1)
    throw new Error(
      table === "observations"
        ? "UNSUPPORTED_OBSERVATION_SOURCE_INDEX"
        : "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    );
}

function checkIdentitySchema(db: Database.Database): void {
  checkTableSchema(db, "asset_id_map", IDENTITY_COLUMNS);
  for (const [name, column, cid, origin] of [
    ["sqlite_autoindex_asset_id_map_1", "provisional_id", 0, "pk"],
    ["aim_canonical_idx", "canonical_id", 1, "c"],
  ] as const)
    checkUniqueIndex(db, "asset_id_map", name, column, cid, origin);
}

function decodeIdentity(raw: Record<string, unknown>): Readonly<Record<IdentityColumn, string>> {
  if (raw.admissible !== 1) throw new Error("INVALID_OR_OVERSIZED_IDENTITY_SOURCE_ROW");
  const identity = Object.fromEntries(
    IDENTITY_COLUMNS.map(([name]) => {
      if (!(raw[name] instanceof Uint8Array)) throw new Error("INVALID_IDENTITY_SOURCE_TEXT");
      return [name, utf8.decode(raw[name])];
    }),
  ) as Record<IdentityColumn, string>;
  if (!identity.provisional_id.trim() || hasControlCharacter(identity.provisional_id))
    throw new Error("INVALID_IDENTITY_SOURCE_KEY");
  assertBaselineCanonicalId(identity.canonical_id);
  return Object.freeze(identity);
}

function checkSchema(db: Database.Database): void {
  checkTableSchema(db, "observations", COLUMNS);
  // A known BINARY ascending primary-key index avoids an unbounded temporary sort.
  checkUniqueIndex(db, "observations", "sqlite_autoindex_observations_1", "id", 0, "pk");
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
        hasControlCharacter(id) ||
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
            (value !== null && !["string", "number", "boolean"].includes(typeof value)) ||
            (typeof value === "number" && !Number.isFinite(value)),
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
 * or a caller-asserted manifest. Acquisition origin is process-local, not admission. Only this
 * table is covered. Full exhaustion plus final reread is needed; early return closes
 * resources and rereads bytes but cannot establish domain completeness.
 */
export function streamPreparedObservations(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedObservationSourceRow> {
  return streamPreparedSnapshot(prepared, snapshotUri, "OBSERVATION", function* (db) {
    checkSchema(db);
    yield* readRows(db, prepared.manifest.period);
  });
}

/** Complete identity-map scan in retained primary-key byte order. Unreferenced
 * mappings are evidence too and must not disappear during baseline conversion. */
export function streamPreparedObservationIdentityMap(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<RetainedObservationIdentityMapRow> {
  return streamPreparedSnapshot(prepared, snapshotUri, "OBSERVATION", function* (db, artifact) {
    checkSchema(db);
    checkIdentitySchema(db);
    const guard = IDENTITY_COLUMNS.map(
      ([name]) => `typeof("${name}")='text' AND octet_length("${name}")<=${MAX_KEY_BYTES}`,
    ).join(" AND ");
    const selected = IDENTITY_COLUMNS.map(
      ([name]) => `CASE WHEN ${guard} THEN CAST("${name}" AS BLOB) END AS "${name}"`,
    ).join(",");
    const rows = db.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,
      ${selected} FROM asset_id_map INDEXED BY sqlite_autoindex_asset_id_map_1
      ORDER BY provisional_id COLLATE BINARY`);
    let previous: Buffer | undefined;
    let count = 0;
    for (const raw of rows.iterate() as Iterable<Record<string, unknown>>) {
      if (++count > MAX_ROWS) throw new Error("IDENTITY_SOURCE_ROW_LIMIT");
      const identity = decodeIdentity(raw);
      const key = Buffer.from(identity.provisional_id);
      if (previous && Buffer.compare(previous, key) >= 0)
        throw new Error("INVALID_IDENTITY_SOURCE_ORDER");
      previous = key;
      yield Object.freeze({
        identity,
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          identityLocator: Object.freeze({
            table: "asset_id_map" as const,
            provisional_id: identity.provisional_id,
          }),
        }),
      });
    }
  });
}

/**
 * Resolve the observation's explicitly declared ID namespace against retained mappings.
 * Locators describe actual rows in this snapshot, not factory local IDs or device proof.
 * Never rewrite the signed payload with the canonical ID. Complete consumption and
 * independent domain reconciliation remain necessary before target admission.
 */
export function streamPreparedObservationIdentities(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
  assetIdNamespace: "provisional" | "canonical",
): AsyncGenerator<RetainedObservationIdentity> {
  if (assetIdNamespace !== "provisional" && assetIdNamespace !== "canonical")
    throw new Error("EXPLICIT_SOURCE_ASSET_ID_NAMESPACE_REQUIRED");
  return streamPreparedSnapshot(prepared, snapshotUri, "OBSERVATION", function* (db, artifact) {
    checkSchema(db);
    checkIdentitySchema(db);
    const column = assetIdNamespace === "provisional" ? "provisional_id" : "canonical_id";
    const index =
      assetIdNamespace === "provisional" ? "sqlite_autoindex_asset_id_map_1" : "aim_canonical_idx";
    // Each cell is guarded before transfer. Invalid matched rows fail, not disappear.
    const guard = IDENTITY_COLUMNS.map(
      ([name]) => `typeof("${name}")='text' AND octet_length("${name}")<=${MAX_KEY_BYTES}`,
    ).join(" AND ");
    const selected = IDENTITY_COLUMNS.map(
      ([name]) => `CASE WHEN ${guard} THEN CAST("${name}" AS BLOB) END AS "${name}"`,
    ).join(",");
    const lookup = db.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS admissible,
      ${selected} FROM asset_id_map INDEXED BY ${index} WHERE "${column}" COLLATE BINARY=?`);
    for (const observation of readRows(db, prepared.manifest.period)) {
      const assetId = observation.columns.asset_id;
      if (
        typeof assetId !== "string" ||
        !assetId.trim() ||
        Buffer.byteLength(assetId) > MAX_KEY_BYTES
      )
        throw new Error("INVALID_OBSERVATION_IDENTITY_KEY");
      const raw = lookup.get(assetId) as Record<string, unknown> | undefined;
      if (!raw) throw new Error("UNRESOLVED_OBSERVATION_IDENTITY");
      const identity = decodeIdentity(raw);
      if (identity[column] !== assetId) throw new Error("OBSERVATION_IDENTITY_MISMATCH");
      yield Object.freeze({
        observation,
        identity: Object.freeze(identity),
        source: Object.freeze({
          manifestSha256: prepared.manifestSha256,
          artifact,
          observationLocator: Object.freeze({
            table: "observations" as const,
            id: observation.columns.id as string,
          }),
          identityLocator: Object.freeze({
            table: "asset_id_map" as const,
            provisional_id: identity.provisional_id,
          }),
          assetIdNamespace,
        }),
      });
    }
  });
}
