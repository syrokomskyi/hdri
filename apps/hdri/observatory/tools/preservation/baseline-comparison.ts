/*
<MODULE_CONTRACT>
  <purpose>Compare baseline records by exact keys and typed values using bounded streams.</purpose>
  <non-goals>
    <item>Does not authenticate archives, choose source projections, convert schemas or issue import receipts.</item>
    <item>Does not normalize JSON, timestamps, UUIDs or missing values.</item>
  </non-goals>
  <!-- risk: crypto -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 A1: compare exact typed values, keys and content digests without count-only or empty-domain success.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Equal means both complete, nonempty streams matched exactly; callers must independently establish domain/projection completeness.
import { createHash } from "node:crypto";

export type BaselineValue = string | number | bigint | boolean | Uint8Array | null;
export type BaselineRecord = Readonly<{ key: string; values: readonly BaselineValue[] }>;
export type BaselineDifference = Readonly<{
  kind: "missing" | "unexpected" | "value";
  key: string;
  fields: readonly string[];
}>;
export type BaselineDomainComparison = Readonly<{
  domain: string;
  status: "equal" | "different" | "empty";
  sourceRows: number;
  targetRows: number;
  matchedRows: number;
  missingRows: number;
  unexpectedRows: number;
  differingRows: number;
  fieldDifferences: Readonly<Record<string, number>>;
  sourceSha256: string;
  targetSha256: string;
  differences: readonly BaselineDifference[];
  omittedDifferences: number;
}>;

const MAX_FIELDS = 256;
const MAX_KEY_BYTES = 4096;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const MAX_DIFFERENCES = 100;
const MAX_ROWS = 100_000_000;
const SQLITE_MIN_INTEGER = -(1n << 63n);
const SQLITE_MAX_INTEGER = (1n << 63n) - 1n;

function boundedText(value: unknown, maxBytes: number): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value) > maxBytes ||
    Buffer.from(value).toString("utf8") !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error("INVALID_BASELINE_COMPARISON_TEXT");
}

/** Distinguish NULL, false, 0, integer, float, text and binary without lossy coercion. */
function encodeValue(value: BaselineValue): readonly [string, string] {
  if (value === null) return ["null", ""];
  if (typeof value === "string") return ["text", value];
  if (typeof value === "boolean") return ["bool", value ? "true" : "false"];
  if (typeof value === "bigint" && value >= SQLITE_MIN_INTEGER && value <= SQLITE_MAX_INTEGER)
    return ["integer", String(value)];
  if (typeof value === "number" && Number.isFinite(value))
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (value instanceof Uint8Array) return ["blob", Buffer.from(value).toString("hex")];
  throw new Error("INVALID_BASELINE_COMPARISON_VALUE");
}

/**
 * Input streams must each be unique and sorted by UTF-8 key bytes (SQLite COLLATE BINARY).
 * Keeps only the current pair of rows and at most 100 differences, never their values.
 * A throwing/duplicate/unsorted reader cannot return an equality report. Exhaustion
 * is not proof of source completeness: I/O readers must establish that separately
 * and enforce cell limits before allocation.
 */
export function compareBaselineRecords(opts: {
  domain: string;
  fields: readonly string[];
  source: Iterable<BaselineRecord>;
  target: Iterable<BaselineRecord>;
}): BaselineDomainComparison {
  boundedText(opts.domain, 256);
  if (!Array.isArray(opts.fields) || !opts.fields.length || opts.fields.length > MAX_FIELDS)
    throw new Error("INVALID_BASELINE_COMPARISON_FIELDS");
  const domain = opts.domain;
  const fields = [...opts.fields];
  for (const field of fields) boundedText(field, 256);
  if (new Set(fields).size !== fields.length)
    throw new Error("DUPLICATE_BASELINE_COMPARISON_FIELD");
  const header = `${JSON.stringify(["hdri-baseline-projection@1", domain, fields])}\n`;
  const sourceHash = createHash("sha256").update(header);
  const targetHash = createHash("sha256").update(header);
  const totals = { sourceRows: 0, targetRows: 0 };
  let matchedRows = 0,
    missingRows = 0,
    unexpectedRows = 0,
    differingRows = 0,
    omittedDifferences = 0;
  const fieldDifferences = new Map(fields.map((field) => [field, 0]));
  const differences: BaselineDifference[] = [];
  function recordDifference(
    kind: BaselineDifference["kind"],
    key: string,
    changedFields: string[],
  ) {
    if (differences.length < MAX_DIFFERENCES)
      differences.push({ kind, key, fields: changedFields });
    else omittedDifferences++;
  }

  function* checked(records: Iterator<BaselineRecord>, side: "sourceRows" | "targetRows") {
    let previous: Buffer | undefined;
    const hash = side === "sourceRows" ? sourceHash : targetHash;
    while (true) {
      const next = records.next();
      if (next.done) return;
      const record = next.value;
      if (
        !record ||
        typeof record !== "object" ||
        Object.keys(record).sort().join(",") !== "key,values"
      )
        throw new Error("INVALID_BASELINE_COMPARISON_RECORD");
      boundedText(record.key, MAX_KEY_BYTES);
      const keyBytes = Buffer.from(record.key);
      if (previous) {
        const order = Buffer.compare(previous, keyBytes);
        if (order === 0) throw new Error(`DUPLICATE_BASELINE_KEY: ${side}`);
        if (order > 0) throw new Error(`UNSORTED_BASELINE_INPUT: ${side}`);
      }
      if (!Array.isArray(record.values) || record.values.length !== fields.length)
        throw new Error("INVALID_BASELINE_COMPARISON_RECORD_WIDTH");
      // Reject oversized cells before hex/JSON expansion, then bound the whole encoded row.
      let rawBytes = keyBytes.length;
      for (const value of record.values) {
        rawBytes +=
          typeof value === "string"
            ? Buffer.byteLength(value)
            : value instanceof Uint8Array
              ? value.byteLength
              : 32;
        if (rawBytes > MAX_RECORD_BYTES) throw new Error("BASELINE_COMPARISON_RECORD_LIMIT");
      }
      const values = Array.from(record.values, encodeValue);
      const bytes = `${JSON.stringify([record.key, values])}\n`;
      if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES)
        throw new Error("BASELINE_COMPARISON_RECORD_LIMIT");
      if (++totals[side] > MAX_ROWS) throw new Error("BASELINE_COMPARISON_ROW_LIMIT");
      hash.update(bytes);
      previous = keyBytes;
      yield { key: record.key, keyBytes, values };
    }
  }

  let sourceInput: Iterator<BaselineRecord> | undefined;
  let targetInput: Iterator<BaselineRecord> | undefined;
  try {
    sourceInput = opts.source[Symbol.iterator]();
    targetInput = opts.target[Symbol.iterator]();
    if (sourceInput === targetInput) throw new Error("INDEPENDENT_BASELINE_READERS_REQUIRED");
    const source = checked(sourceInput, "sourceRows");
    const target = checked(targetInput, "targetRows");
    let left = source.next(),
      right = target.next();
    while (!left.done || !right.done) {
      const order = left.done
        ? 1
        : right.done
          ? -1
          : Buffer.compare(left.value.keyBytes, right.value.keyBytes);
      if (!left.done && order < 0) {
        missingRows++;
        recordDifference("missing", left.value.key, []);
        left = source.next();
      } else if (!right.done && order > 0) {
        unexpectedRows++;
        recordDifference("unexpected", right.value.key, []);
        right = target.next();
      } else if (!left.done && !right.done) {
        matchedRows++;
        const changed: string[] = [];
        for (let i = 0; i < fields.length; i++) {
          if (
            left.value.values[i][0] !== right.value.values[i][0] ||
            left.value.values[i][1] !== right.value.values[i][1]
          ) {
            changed.push(fields[i]);
            fieldDifferences.set(fields[i], fieldDifferences.get(fields[i])! + 1);
          }
        }
        if (changed.length) {
          differingRows++;
          recordDifference("value", left.value.key, changed);
        }
        left = source.next();
        right = target.next();
      }
    }
  } finally {
    try {
      sourceInput?.return?.();
    } finally {
      targetInput?.return?.();
    }
  }
  return {
    domain,
    status:
      missingRows || unexpectedRows || differingRows
        ? "different"
        : matchedRows
          ? "equal"
          : "empty",
    ...totals,
    matchedRows,
    missingRows,
    unexpectedRows,
    differingRows,
    fieldDifferences: Object.fromEntries(fieldDifferences),
    sourceSha256: sourceHash.digest("hex"),
    targetSha256: targetHash.digest("hex"),
    differences,
    omittedDifferences,
  };
}
