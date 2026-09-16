import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { migrateObservatory } from "../db/migrate.js";
import {
  compareBaselineRecords,
  type BaselineRecord,
  type BaselineValue,
  type BaselineRecordStream,
} from "../../tools/preservation/baseline-comparison.js";
import { inventorySources } from "../../tools/preservation/inventory.js";
import {
  prepareBaselineSource,
  preserveQ2,
  verifyReplicas,
} from "../../tools/preservation/preserve.js";

const dbs: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const uuid = "0198f000-0000-7000-8000-000000000001";
const fields = [
  "asset_id",
  "signal_path",
  "value_num",
  "observed_at",
  "recorded_at",
  "collection_status",
  "evidence_ref",
];
function database(file = ":memory:") {
  const db = new Database(file);
  dbs.push(db);
  return db;
}
function fixture(wal = false) {
  const root = wal ? fs.mkdtempSync(path.join(os.tmpdir(), "hdri-comparison-wal-")) : undefined;
  if (root) roots.push(root);
  const sourceRoot = root ? path.join(root, "source") : undefined;
  if (sourceRoot) fs.mkdirSync(sourceRoot);
  const source = database(sourceRoot ? path.join(sourceRoot, "source.db") : undefined);
  if (wal) {
    source.pragma("journal_mode=WAL");
    source.pragma("wal_autocheckpoint=0");
  }
  source.exec(
    "CREATE TABLE retained (observation_id TEXT PRIMARY KEY, canonical_id TEXT, signal TEXT, measured REAL, measured_at TEXT, recorded TEXT, collection TEXT, evidence TEXT)",
  );
  source
    .prepare("INSERT INTO retained VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "obs-1",
      uuid,
      "reachability.latency_ms",
      12.5,
      "2026-05-02T10:00:00Z",
      "2026-05-02T11:00:00Z",
      null,
      "cas/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  const target = database();
  migrateObservatory(target);
  // Independently specified current-schema expected record, not the converter's output.
  target
    .prepare(
      `INSERT INTO observations (id, asset_id, signal_path, ontology_version,
    value_num, value_type, observed_at, recorded_at, run_id, evidence_ref, collection_status)
    VALUES ('obs-1', '0198f000-0000-7000-8000-000000000001', 'reachability.latency_ms', 'fixture',
    12.5, 'num', '2026-05-02T10:00:00Z', '2026-05-02T11:00:00Z', 'retained-run',
    'cas/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', NULL)`,
    )
    .run();
  const sourceRows = () =>
    project(
      source.prepare(
        "SELECT observation_id, canonical_id, signal, measured, measured_at, recorded, collection, evidence FROM retained ORDER BY observation_id COLLATE BINARY",
      ),
    );
  const targetRows = () =>
    project(
      target.prepare(
        "SELECT id, asset_id, signal_path, value_num, observed_at, recorded_at, collection_status, evidence_ref FROM observations ORDER BY id COLLATE BINARY",
      ),
    );
  return {
    source,
    target,
    root,
    sourceRoot,
    targetRows,
    compare: () =>
      compareBaselineRecords({
        domain: "observations",
        fields,
        source: sourceRows(),
        target: targetRows(),
      }),
  };
}
function* project(statement: Database.Statement): Generator<BaselineRecord> {
  for (const row of statement.raw().safeIntegers().iterate() as Iterable<
    [string, ...BaselineValue[]]
  >)
    yield { key: row[0], values: row.slice(1) };
}
const record = (key: string, value: BaselineValue = 1): BaselineRecord => ({
  key,
  values: [value],
});
const compare = (source: BaselineRecordStream, target: BaselineRecordStream) =>
  compareBaselineRecords({ domain: "test-domain", fields: ["value"], source, target });

describe("exact baseline record comparison", () => {
  it("awaits both asynchronous completion barriers before resolving equality", async () => {
    const completed: string[] = [];
    async function* rows(side: string) {
      try {
        await Promise.resolve();
        yield record("a");
      } finally {
        await Promise.resolve();
        completed.push(side);
      }
    }
    expect((await compare(rows("source"), rows("target"))).status).toBe("equal");
    expect(completed).toEqual(["source", "target"]);
  });
  it.each(["source", "target"])(
    "rejects a %s final-verification failure after matching every row",
    async (side) => {
      const completed: string[] = [];
      async function* rows(name: string) {
        try {
          yield record("a");
        } finally {
          await Promise.resolve();
          completed.push(name);
          if (name === side) throw new Error("FIXTURE_FINAL_VERIFICATION_FAILED");
        }
      }
      await expect(compare(rows("source"), rows("target"))).rejects.toThrow(
        "FIXTURE_FINAL_VERIFICATION_FAILED",
      );
      expect(completed.sort()).toEqual(["source", "target"]);
    },
  );
  it("awaits target cleanup even when source cleanup rejects", async () => {
    const completed: string[] = [];
    const source: AsyncIterable<BaselineRecord> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("FIXTURE_READ_FAILED");
          },
          async return() {
            await Promise.resolve();
            completed.push("source");
            throw new Error("FIXTURE_CLOSE_FAILED");
          },
        };
      },
    };
    const target: AsyncIterable<BaselineRecord> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: true, value: undefined };
          },
          async return() {
            await Promise.resolve();
            completed.push("target");
            return { done: true, value: undefined };
          },
        };
      },
    };
    await expect(compare(source, target)).rejects.toThrow("FIXTURE_CLOSE_FAILED");
    expect(completed).toEqual(["source", "target"]);
  });
  it("closes an acquired source when acquiring the target iterator fails", async () => {
    let closed = false;
    const source: AsyncIterable<BaselineRecord> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: true, value: undefined };
          },
          async return() {
            await Promise.resolve();
            closed = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
    const target: AsyncIterable<BaselineRecord> = {
      [Symbol.asyncIterator]() {
        throw new Error("FIXTURE_ACQUIRE_FAILED");
      },
    };
    await expect(compare(source, target)).rejects.toThrow("FIXTURE_ACQUIRE_FAILED");
    expect(closed).toBe(true);
  });
  it("rejects a shared async iterator without consuming alternating records", async () => {
    async function* rows() {
      yield record("a");
    }
    const iterator = rows();
    await expect(compare(iterator, iterator)).rejects.toThrow(
      "INDEPENDENT_BASELINE_READERS_REQUIRED",
    );
  });
  it("keeps asynchronous readers within one-row lookahead over 10000 records", async () => {
    let sourceRead = 0,
      targetRead = 0;
    async function* source() {
      for (let n = 0; n < 10000; n++) {
        await Promise.resolve();
        sourceRead++;
        expect(sourceRead - targetRead).toBeLessThanOrEqual(1);
        yield record(String(n).padStart(5, "0"), n);
      }
    }
    async function* target() {
      for (let n = 0; n < 10000; n++) {
        await Promise.resolve();
        targetRead++;
        yield record(String(n).padStart(5, "0"), n);
      }
    }
    expect(await compare(source(), target())).toMatchObject({
      status: "equal",
      matchedRows: 10000,
    });
  });
  it("compares an independently specified current-schema SQLite observation", async () => {
    const { compare } = fixture();
    const report = await compare();
    expect(report).toMatchObject({
      status: "equal",
      sourceRows: 1,
      targetRows: 1,
      matchedRows: 1,
      missingRows: 0,
      unexpectedRows: 0,
      differingRows: 0,
      differences: [],
      omittedDifferences: 0,
    });
    expect(report.sourceSha256).toBe(report.targetSha256);
    expect(report.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["asset_id", "0198f000-0000-7000-8000-000000000002"],
    ["signal_path", "different.signal"],
    ["value_num", 999],
    ["observed_at", "2026-09-14T00:00:00Z"],
    ["recorded_at", "2026-09-14T00:00:00Z"],
    ["collection_status", "unreachable"],
    ["evidence_ref", "cas/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
  ])("detects a same-count change in %s", async (field, replacement) => {
    const { target, compare } = fixture();
    target.prepare(`UPDATE observations SET "${field}" = ?`).run(replacement);
    const result = await compare();
    expect(result).toMatchObject({
      status: "different",
      sourceRows: 1,
      targetRows: 1,
      matchedRows: 1,
      differingRows: 1,
      missingRows: 0,
      unexpectedRows: 0,
    });
    expect(result.fieldDifferences[field]).toBe(1);
    expect(result.differences).toEqual([{ kind: "value", key: "obs-1", fields: [field] }]);
    expect(result.sourceSha256).not.toBe(result.targetSha256);
  });

  it("detects a same-count key replacement as one missing and one unexpected observation", async () => {
    const { target, compare } = fixture();
    target.exec("UPDATE observations SET id='obs-2'");
    expect(await compare()).toMatchObject({
      status: "different",
      sourceRows: 1,
      targetRows: 1,
      matchedRows: 0,
      missingRows: 1,
      unexpectedRows: 1,
      differences: [
        { kind: "missing", key: "obs-1", fields: [] },
        { kind: "unexpected", key: "obs-2", fields: [] },
      ],
    });
  });

  it("does not call an empty comparison domain equal", async () => {
    expect(await compare([], [])).toMatchObject({ status: "empty", sourceRows: 0, targetRows: 0 });
    expect(await compare([], [record("a")])).toMatchObject({
      status: "different",
      unexpectedRows: 1,
    });
    expect(await compare([record("a")], [])).toMatchObject({ status: "different", missingRows: 1 });
  });

  it.each([
    [null, 0],
    [false, 0],
    [0, 0n],
    [0, -0],
    ["1", 1],
    [Buffer.from("x"), "78"],
    ['{"a":1,"b":2}', '{"b":2,"a":1}'],
  ] as [BaselineValue, BaselineValue][])(
    "does not silently normalize distinct typed values: %s / %s",
    async (left, right) => {
      expect(await compare([record("a", left)], [record("a", right)])).toMatchObject({
        status: "different",
        differingRows: 1,
      });
    },
  );

  it("preserves SQLite 64-bit integers and binary values in real row iterators", async () => {
    const source = database(),
      target = database();
    source.exec(
      "CREATE TABLE cells (id TEXT, value); INSERT INTO cells VALUES ('a', 9223372036854775807), ('b', X'00FF');",
    );
    target.exec(
      "CREATE TABLE cells (id TEXT, value); INSERT INTO cells VALUES ('a', 9223372036854775807), ('b', X'00FF');",
    );
    const run = () =>
      compare(
        project(source.prepare("SELECT id,value FROM cells ORDER BY id")),
        project(target.prepare("SELECT id,value FROM cells ORDER BY id")),
      );
    expect((await run()).status).toBe("equal");
    target.exec("UPDATE cells SET value=9223372036854775806 WHERE id='a'");
    expect(await run()).toMatchObject({ status: "different", differingRows: 1 });
  });

  it("compares a preserved WAL-backed snapshot without changing any original or archive bytes", async () => {
    const { root, sourceRoot, targetRows } = fixture(true);
    const inventory = () =>
      Object.fromEntries(
        fs
          .readdirSync(sourceRoot!)
          .sort()
          .map((name) => [
            name,
            createHash("sha256")
              .update(fs.readFileSync(path.join(sourceRoot!, name)))
              .digest("hex"),
          ]),
      );
    const before = inventory();
    expect(fs.statSync(path.join(sourceRoot!, "source.db-wal")).size).toBeGreaterThan(0);
    const signingKey = {
      ...generateSigningKey(),
      signingKeyId: "fixture-key",
      collectorId: "fixture",
    };
    // Fixture destination labels prove copy mechanics, not physical independence.
    const destinations = [0, 1, 2].map((i) => ({
      path: path.join(root!, `copy-${i}`),
      failureDomain: `fixture-${i}`,
      medium: `fixture-${i}`,
      credentialBoundary: `fixture-${i}`,
    }));
    const preserved = await preserveQ2({
      inventory: await inventorySources({ roots: [sourceRoot!] }),
      sourceRoots: [sourceRoot!],
      destinations,
      dryRun: false,
      signingKey,
    });
    expect(preserved.status, JSON.stringify(preserved.violations)).toBe("pass");
    const prepared = await prepareBaselineSource({
      destinations,
      manifestSha256: preserved.inputFingerprint,
      verificationKeys: new Map([
        [
          signingKey.signingKeyId,
          { signingKeyId: signingKey.signingKeyId, publicKeyPem: signingKey.publicKeyPem },
        ],
      ]),
      sourceDestinationPath: destinations[0].path,
      workRoot: path.join(root!, "comparison-source"),
    });
    const snapshotRef = prepared.manifest.artifacts.find(
      (artifact) =>
        artifact.sourceRole === "source-0000/source.db" &&
        artifact.representation === "sqlite-snapshot",
    );
    expect(snapshotRef).toBeDefined();
    const snapshot = new Database(path.join(prepared.root, snapshotRef!.uri), {
      readonly: true,
      fileMustExist: true,
    });
    dbs.push(snapshot);
    expect(
      (
        await compareBaselineRecords({
          domain: "observations",
          fields,
          source: project(
            snapshot.prepare(
              "SELECT observation_id, canonical_id, signal, measured, measured_at, recorded, collection, evidence FROM retained ORDER BY observation_id COLLATE BINARY",
            ),
          ),
          target: targetRows(),
        })
      ).status,
    ).toBe("equal");
    snapshot.close();
    expect(inventory()).toEqual(before);
    expect(
      (
        await verifyReplicas({
          destinations,
          manifestSha256: preserved.inputFingerprint,
          verificationKeys: new Map([
            [
              signingKey.signingKeyId,
              { signingKeyId: signingKey.signingKeyId, publicKeyPem: signingKey.publicKeyPem },
            ],
          ]),
        })
      ).status,
    ).toBe("pass");
  });

  it("fails on duplicate or out-of-order keys from either reader", async () => {
    for (const side of ["source", "target"]) {
      await expect(
        compareBaselineRecords({
          domain: "test",
          fields: ["value"],
          source: [],
          target: [],
          [side]: [record("a"), record("a")],
        }),
      ).rejects.toThrow(/DUPLICATE_BASELINE_KEY/);
      await expect(
        compareBaselineRecords({
          domain: "test",
          fields: ["value"],
          source: [],
          target: [],
          [side]: [record("b"), record("a")],
        }),
      ).rejects.toThrow(/UNSORTED_BASELINE_INPUT/);
    }
  });

  it("uses UTF-8 byte ordering, including non-BMP keys", async () => {
    const rows = [record("\uE000"), record("\u{10000}")];
    expect((await compare(rows, rows)).status).toBe("equal");
  });

  it("closes both readers and cannot return success when a source read fails mid-stream", async () => {
    let sourceClosed = false,
      targetClosed = false;
    function* source() {
      try {
        yield record("a");
        throw new Error("FIXTURE_IO_INTERRUPTED");
      } finally {
        sourceClosed = true;
      }
    }
    function* target() {
      try {
        yield record("a");
        yield record("b");
      } finally {
        targetClosed = true;
      }
    }
    await expect(compare(source(), target())).rejects.toThrow(/FIXTURE_IO_INTERRUPTED/);
    expect([sourceClosed, targetClosed]).toEqual([true, true]);
  });

  it("closes a target SQLite cursor even if the first source read fails", async () => {
    const target = database();
    target.exec("CREATE TABLE cells(id TEXT, value); INSERT INTO cells VALUES ('a', 1)");
    const cursor = target
      .prepare<[], { id: string; value: number }>("SELECT id, value FROM cells")
      .iterate();
    const targetReader = {
      [Symbol.iterator]() {
        return this;
      },
      next() {
        const row = cursor.next();
        return row.done
          ? { done: true as const, value: undefined }
          : { done: false as const, value: record(String(row.value.id), Number(row.value.value)) };
      },
      return() {
        cursor.return?.();
        return { done: true as const, value: undefined };
      },
    };
    const source = {
      *[Symbol.iterator](): Generator<BaselineRecord> {
        throw new Error("FIXTURE_FIRST_READ_FAILED");
      },
    };
    await expect(compare(source, targetReader)).rejects.toThrow(/FIXTURE_FIRST_READ_FAILED/);
    expect(() => target.close()).not.toThrow();
  });

  it("rejects a shared one-shot iterator instead of comparing alternating records", async () => {
    const iterator = [record("a")][Symbol.iterator]();
    await expect(compare(iterator, iterator)).rejects.toThrow(
      /INDEPENDENT_BASELINE_READERS_REQUIRED/,
    );
  });

  it("keeps bounded reader lookahead and diagnostic samples over 25000 rows", async () => {
    let sourceRead = 0,
      targetRead = 0;
    function* source() {
      for (let i = 0; i < 25000; i++) {
        sourceRead++;
        expect(sourceRead - targetRead).toBeLessThanOrEqual(1);
        yield record(String(i).padStart(5, "0"), i);
      }
    }
    function* target() {
      for (let i = 0; i < 25000; i++) {
        targetRead++;
        yield record(String(i).padStart(5, "0"), -1);
      }
    }
    expect(await compare(source(), target())).toMatchObject({
      status: "different",
      sourceRows: 25000,
      targetRows: 25000,
      differingRows: 25000,
      fieldDifferences: { value: 25000 },
      omittedDifferences: 24900,
    });
  });

  it("binds domain and field order in the projection digests", async () => {
    const rows = [{ key: "a", values: [1, 2] }];
    const base = { domain: "observations", fields: ["one", "two"], source: rows, target: rows };
    const original = (await compareBaselineRecords(base)).sourceSha256;
    expect((await compareBaselineRecords({ ...base, domain: "assets" })).sourceSha256).not.toBe(
      original,
    );
    expect(
      (await compareBaselineRecords({ ...base, fields: ["two", "one"] })).sourceSha256,
    ).not.toBe(original);
  });

  it.each([undefined, NaN, Infinity, {}, 1n << 64n])(
    "rejects an unrepresentable value rather than serializing it as null: %s",
    async (value) => {
      await expect(compare([{ key: "a", values: [value as BaselineValue] }], [])).rejects.toThrow(
        /INVALID_BASELINE_COMPARISON_VALUE/,
      );
    },
  );

  it("rejects missing fields, duplicate columns, oversized rows and ill-formed Unicode keys", async () => {
    await expect(compare([{ key: "a", values: [] }], [])).rejects.toThrow(/RECORD_WIDTH/);
    await expect(compare([{ key: "a", values: new Array(1) }], [])).rejects.toThrow(
      /INVALID_BASELINE_COMPARISON_VALUE/,
    );
    await expect(
      compareBaselineRecords({ domain: "test", fields: ["a", "a"], source: [], target: [] }),
    ).rejects.toThrow(/DUPLICATE_BASELINE_COMPARISON_FIELD/);
    await expect(compare([record("a", "x".repeat(8 * 1024 * 1024))], [])).rejects.toThrow(
      /RECORD_LIMIT/,
    );
    await expect(compare([record("\ud800")], [])).rejects.toThrow(/COMPARISON_TEXT/);
  });
});
