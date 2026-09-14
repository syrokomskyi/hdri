import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSigningKey, signObservation } from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { inspectRetainedFile } from "@warpgogol/pipeline-node";
import { migrateObservatory } from "../db/migrate.js";
import { streamInsertObservations } from "../db/sync-writers.js";
import { inventorySources } from "../../tools/preservation/inventory.js";
import {
  preserveQ2,
  prepareBaselineSource,
  assertPreparedBaselineSource,
  verifyReplicas,
} from "../../tools/preservation/preserve.js";
import {
  streamPreparedObservations,
  streamPreparedObservationIdentities,
} from "../../tools/preservation/observation-source.js";

const roots: string[] = [];
const handles: Database.Database[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of handles.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const key = { ...generateSigningKey(), signingKeyId: "test-source", collectorId: "test-device" };
const id = "0198f000-0000-7000-8000-000000000001";
const observation: Observation = {
  observation_id: id,
  asset_id: "0198f000-0000-7000-8000-000000000002",
  crawl_id: "retained-crawl",
  signal_path: "web.presence",
  value_bool: false,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: "bool",
  observed_at: "2026-05-02T10:00:00+02:00",
  recorded_at: "2026-05-03T11:00:00Z",
  collector_version: "1",
  probe_version: null,
  ruleset_version: "1",
  source_hash: null,
  crawl_hash: "2026-q2-de",
  evidence_ref: null,
  confidence: 0.75,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
};
async function fixture(edit?: (db: Database.Database) => void, wal = false, encoding = "UTF-8") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-observation-reader-"));
  roots.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const db = new Database(path.join(source, "observatory.db"));
  handles.push(db);
  db.pragma(`encoding='${encoding}'`);
  if (wal) {
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
  }
  migrateObservatory(db);
  db.prepare("INSERT INTO asset_id_map VALUES (?, ?, ?, ?)").run(
    "da-retained-site",
    observation.asset_id,
    "retained.example",
    "2026-05-03T11:00:00Z",
  );
  async function* observations() {
    yield observation;
  }
  await streamInsertObservations(db, observations(), {
    runId: "retained-run",
    ontologyVersion: "ontology-1",
    period: "2026-q2",
    factoryRunId: "factory-run",
  });
  const signed = signObservation(observation, key);
  const json = JSON.stringify(signed, null, 2) + "\n";
  db.prepare(
    "UPDATE observations SET obs_json=?, signature=?, signed_at=?, signing_key_id=?, collector_id=?",
  ).run(json, signed.signature, signed.signed_at, signed.signing_key_id, signed.collector_id);
  edit?.(db);
  if (!wal) db.close();
  const destinations = [0, 1, 2].map((n) => ({
    path: path.join(root, `replica-${n}`),
    failureDomain: `fixture-host-${n}`,
    medium: `fixture-disk-${n}`,
    credentialBoundary: `fixture-key-${n}`,
  }));
  const preserved = await preserveQ2({
    sourceRoots: [source],
    inventory: await inventorySources({ roots: [source] }),
    destinations,
    dryRun: false,
    signingKey: key,
  });
  expect(preserved.status).toBe("pass");
  const options = {
    destinations,
    manifestSha256: preserved.inputFingerprint,
    verificationKeys: new Map([
      [key.signingKeyId, { signingKeyId: key.signingKeyId, publicKeyPem: key.publicKeyPem }],
    ]),
    sourceDestinationPath: destinations[0].path,
    workRoot: path.join(root, "private-work"),
  };
  const prepared = await prepareBaselineSource(options);
  const snapshot = prepared.manifest.artifacts.find((a) => a.representation === "sqlite-snapshot")!;
  const file = path.join(prepared.root, snapshot.uri);
  return {
    root,
    source,
    db,
    options,
    prepared,
    snapshot,
    file,
    json,
    rows: () => streamPreparedObservations(prepared, snapshot.uri),
  };
}
async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of source) result.push(value);
  return result;
}

describe("bounded observation source from private retained snapshots", () => {
  it("reads WAL-only retained data, preserves every column and JSON byte, and leaves originals/replicas unchanged", async () => {
    const f = await fixture(undefined, true);
    const before = await inventorySources({ roots: [f.source] });
    const rows = await collect(f.rows());
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0].columns)).toHaveLength(25);
    expect(rows[0].columns).toMatchObject({
      id,
      value_bool: 0n,
      confidence: 0.75,
      obs_json: f.json,
      period: "2026-q2",
      ontology_version: "ontology-1",
      run_id: "retained-run",
      factory_run_id: "factory-run",
    });
    expect(rows[0].payload).toMatchObject(observation);
    expect(rows[0].payloadSha256).toBe(createHash("sha256").update(f.json).digest("hex"));
    expect(
      Object.isFrozen(rows[0]) &&
        Object.isFrozen(rows[0].columns) &&
        Object.isFrozen(rows[0].payload),
    ).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
    expect(await inspectRetainedFile(f.file)).toEqual({
      sha256: f.snapshot.sha256,
      bytes: f.snapshot.bytes,
    });
  });

  it.each([
    ["asset_id", "other-asset"],
    ["signal_path", "other.signal"],
    ["value_bool", 1],
    ["value_num", 2.5],
    ["value_str", "other"],
    ["value_json", "{}"],
    ["value_type", "num"],
    ["observed_at", "2026-09-14T00:00:00Z"],
    ["recorded_at", "2026-09-14T00:00:00Z"],
    ["evidence_ref", "unresolved/ref"],
    ["extractor_version", "other"],
    ["confidence", 0.5],
    ["status", "deprecated"],
    ["crawl_hash", "other"],
    ["collection_status", "absent"],
  ] as const)("rejects a same-count SQL/JSON change in %s", async (column, value) => {
    const f = await fixture((db) => db.prepare(`UPDATE observations SET "${column}"=?`).run(value));
    await expect(collect(f.rows())).rejects.toThrow(`OBSERVATION_SOURCE_MISMATCH: ${column}`);
  });

  it.each(["signature", "signed_at", "signing_key_id", "collector_id"] as const)(
    "rejects inconsistent embedded %s",
    async (column) => {
      const f = await fixture((db) =>
        db.prepare(`UPDATE observations SET "${column}"='changed'`).run(),
      );
      await expect(collect(f.rows())).rejects.toThrow("OBSERVATION_SOURCE_SIGNING_MISMATCH");
    },
  );

  it("accepts current unsigned base payload without inventing signature metadata", async () => {
    const f = await fixture((db) =>
      db
        .prepare(
          "UPDATE observations SET obs_json=?, signature=NULL, signed_at=NULL, signing_key_id=NULL, collector_id=NULL",
        )
        .run(JSON.stringify(observation)),
    );
    const [row] = await collect(f.rows());
    expect(row.columns.signature).toBeNull();
    expect(row.payload).not.toHaveProperty("signature");
  });

  it.each([
    ["extra column", "ALTER TABLE observations ADD COLUMN unknown TEXT"],
    ["missing column", "ALTER TABLE observations DROP COLUMN confidence"],
    [
      "generated column",
      "ALTER TABLE observations ADD COLUMN derived TEXT GENERATED ALWAYS AS (id) VIRTUAL",
    ],
    [
      "view",
      "ALTER TABLE observations RENAME TO retained; CREATE VIEW observations AS SELECT * FROM retained",
    ],
  ])("rejects unsupported source schema: %s", async (_label, sql) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.rows())).rejects.toThrow("UNSUPPORTED_OBSERVATION_SOURCE_SCHEMA");
  });

  it("rejects UTF-16 storage instead of silently reinterpreting retained bytes", async () => {
    const f = await fixture(undefined, false, "UTF-16le");
    await expect(collect(f.rows())).rejects.toThrow("UNSUPPORTED_OBSERVATION_SOURCE_ENCODING");
  });

  it("rejects a primary key whose collation would require a different ordering", async () => {
    const f = await fixture((db) => {
      const sql = db
        .prepare("SELECT sql FROM sqlite_master WHERE name='observations'")
        .pluck()
        .get() as string;
      db.exec("DROP TABLE observations");
      db.exec(sql.replace(/id\s+TEXT PRIMARY KEY/, "id TEXT PRIMARY KEY COLLATE NOCASE"));
    });
    await expect(collect(f.rows())).rejects.toThrow("UNSUPPORTED_OBSERVATION_SOURCE_INDEX");
  });

  it("preserves Unicode, an initial BOM and embedded NUL inside text cells without normalization", async () => {
    const text = "\uFEFFcafé\0🙂";
    const payload = { ...observation, value_bool: null, value_str: text, value_type: "str" };
    const f = await fixture((db) =>
      db
        .prepare(
          "UPDATE observations SET value_bool=NULL, value_str=?, value_type='str', obs_json=?",
        )
        .run(text, JSON.stringify(payload)),
    );
    const [row] = await collect(f.rows());
    expect(row.columns.value_str).toBe(text);
    expect(row.payload.value_str).toBe(text);
    expect(row.columns.obs_json).toBe(JSON.stringify(payload));
  });

  it("preserves numeric and opaque JSON values as stored, not as reserialized JSON", async () => {
    const f = await fixture((db) => {
      const payload = { ...observation, value_bool: null, value_num: 1.25, value_type: "num" };
      db.prepare(
        "UPDATE observations SET value_bool=NULL, value_num=1.25, value_type='num', obs_json=?",
      ).run(JSON.stringify(payload));
    });
    const [number] = await collect(f.rows());
    expect(number.columns.value_num).toBe(1.25);
    const text = '{ "b":2, "a":1 }';
    const g = await fixture((db) => {
      const payload = { ...observation, value_bool: null, value_json: text, value_type: "json" };
      db.prepare(
        "UPDATE observations SET value_bool=NULL, value_json=?, value_type='json', obs_json=?",
      ).run(text, JSON.stringify(payload));
    });
    expect((await collect(g.rows()))[0].columns.value_json).toBe(text);
  });

  it.each([
    ["period", "UPDATE observations SET period='2026-q3'", "PERIOD_MISMATCH"],
    ["missing JSON", "UPDATE observations SET obs_json=NULL", "INVALID_OR_OVERSIZED"],
    [
      "wrong numeric storage",
      "UPDATE observations SET confidence='not-a-number'",
      "INVALID_OR_OVERSIZED",
    ],
    [
      "non-boolean integer",
      "UPDATE observations SET value_bool=2",
      "INVALID_OBSERVATION_SOURCE_BOOLEAN",
    ],
    ["malformed UTF-8", "UPDATE observations SET value_str=CAST(X'80' AS TEXT)", "encoded data"],
  ])("does not skip %s", async (_label, sql, failure) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.rows())).rejects.toThrow(failure);
  });

  it.each([
    [
      "duplicate key",
      (json: string) =>
        json.replace('"value_bool": false', '"value_bool": true, "value_bool": false'),
      "DUPLICATE",
    ],
    [
      "escaped duplicate key",
      (json: string) =>
        json.replace('"value_bool": false', '"value_bool": true, "value_\\u0062ool": false'),
      "DUPLICATE",
    ],
    ["unknown field", (json: string) => json.replace("{", '{"new_field":1,'), "UNSUPPORTED"],
    [
      "missing field",
      (json: string) => json.replace(/"crawl_id": "retained-crawl",/, ""),
      "UNSUPPORTED",
    ],
    [
      "nested field",
      (json: string) => json.replace('"source_hash": null', '"source_hash": {}'),
      "UNSUPPORTED",
    ],
    [
      "nonfinite parsed number",
      (json: string) => json.replace('"source_hash": null', '"source_hash": 1e999'),
      "UNSUPPORTED",
    ],
    [
      "partial signature",
      (json: string) => json.replace(/"collector_id": "test-device"/, '"collection_status": null'),
      "SIGNING_MISMATCH",
    ],
  ] as const)("rejects %s in the original JSON", async (_label, change, failure) => {
    const f = await fixture((db) => {
      const json = db.prepare("SELECT obs_json FROM observations").pluck().get() as string;
      db.prepare("UPDATE observations SET obs_json=?").run(change(json));
    });
    await expect(collect(f.rows())).rejects.toThrow(failure);
  });

  it("rejects oversized JSON before parsing or transferring its bytes through the driver", async () => {
    const f = await fixture((db) =>
      db.prepare("UPDATE observations SET obs_json=?").run("x".repeat(8 * 1024 * 1024 + 1)),
    );
    const parse = vi.spyOn(JSON, "parse");
    const prepare = Database.prototype.prepare;
    let sentinelSeen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.startsWith("SELECT CASE WHEN")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const raw of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            sentinelSeen = true;
            expect(raw.admissible).toBe(0n);
            expect(
              Object.entries(raw)
                .filter(([name]) => name !== "admissible")
                .every(([, value]) => value === null),
            ).toBe(true);
            yield raw;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.rows())).rejects.toThrow("INVALID_OR_OVERSIZED");
    expect(sentinelSeen).toBe(true);
    expect(parse).not.toHaveBeenCalled();
  });

  it("checks aggregate row bytes, not just the largest cell", async () => {
    const f = await fixture((db) =>
      db
        .prepare("UPDATE observations SET obs_json=?, value_str=?")
        .run("x".repeat(5 * 1024 * 1024), "x".repeat(5 * 1024 * 1024)),
    );
    await expect(collect(f.rows())).rejects.toThrow("INVALID_OR_OVERSIZED");
  });

  it("rejects changed snapshot bytes before opening SQLite", async () => {
    const f = await fixture();
    await fs.appendFile(f.file, "changed");
    const open = vi.spyOn(Database.prototype, "prepare");
    await expect(collect(f.rows())).rejects.toThrow("OBSERVATION_SNAPSHOT_CHANGED");
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a symlink replacing the selected snapshot", async () => {
    const f = await fixture();
    await fs.rename(f.file, f.file + ".saved");
    await fs.symlink(f.file + ".saved", f.file);
    await expect(collect(f.rows())).rejects.toThrow("UNSAFE_OBJECT_PATH");
  });

  it("closes and checks the snapshot after a decoding failure", async () => {
    const f = await fixture((db) => db.exec("UPDATE observations SET obs_json='{'"));
    const close = vi.spyOn(Database.prototype, "close");
    await expect(collect(f.rows())).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
    expect(await inspectRetainedFile(f.file)).toEqual({
      sha256: f.snapshot.sha256,
      bytes: f.snapshot.bytes,
    });
  });

  it.each(["-wal", "-shm", "-journal"])(
    "rejects even an empty snapshot sidecar %s",
    async (suffix) => {
      const f = await fixture();
      await fs.writeFile(f.file + suffix, "");
      await expect(collect(f.rows())).rejects.toThrow("OBSERVATION_SNAPSHOT_SIDECAR");
    },
  );

  it("rejects original, missing and traversal selections", async () => {
    const f = await fixture();
    expect(() => streamPreparedObservations(f.prepared, "../source/observatory.db")).toThrow();
    expect(() => streamPreparedObservations(f.prepared, "snapshots/missing.db")).toThrow(
      "DECLARED",
    );
    expect(() =>
      streamPreparedObservations(
        f.prepared,
        f.prepared.manifest.artifacts.find((a) => a.representation === "original")!.uri,
      ),
    ).toThrow("DECLARED");
  });

  it("accepts only the completed preparation object, never forged or deserialized metadata", async () => {
    const f = await fixture();
    expect(() => assertPreparedBaselineSource(f.prepared)).not.toThrow();
    const lstat = vi.spyOn(fs, "lstat");
    for (const forged of [structuredClone(f.prepared), Object.freeze({ ...f.prepared })]) {
      expect(() => assertPreparedBaselineSource(forged)).toThrow(
        "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
      );
      expect(() => streamPreparedObservations(forged, f.snapshot.uri)).toThrow(
        "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
      );
    }
    for (const invalid of [null, undefined, {}, "metadata", 1]) {
      expect(() => assertPreparedBaselineSource(invalid)).toThrow(
        "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
      );
    }
    expect(lstat).not.toHaveBeenCalled();
  });

  it.each(["exhaustion", "early return"])(
    "detects changed bytes during reading on %s and closes the connection",
    async (finish) => {
      const f = await fixture();
      const close = vi.spyOn(Database.prototype, "close");
      const rows = f.rows();
      expect((await rows.next()).done).toBe(false);
      await fs.appendFile(f.file, "changed after first row");
      await expect(finish === "exhaustion" ? rows.next() : rows.return(undefined)).rejects.toThrow(
        "OBSERVATION_SNAPSHOT_CHANGED",
      );
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it("closes a healthy early-return stream without creating sidecars or altering bytes", async () => {
    const f = await fixture();
    const close = vi.spyOn(Database.prototype, "close");
    for await (const row of f.rows()) {
      expect(row.columns.id).toBe(id);
      break;
    }
    expect(close).toHaveBeenCalledTimes(1);
    expect(await inspectRetainedFile(f.file)).toEqual({
      bytes: f.snapshot.bytes,
      sha256: f.snapshot.sha256,
    });
  });

  it("streams a large ordered domain lazily and returns no made-up row for an empty domain", async () => {
    const f = await fixture((db) => {
      db.exec("DELETE FROM observations");
      const insert =
        db.prepare(`INSERT INTO observations (id, asset_id, signal_path, ontology_version,
        value_bool, value_type, observed_at, recorded_at, run_id, confidence, status, obs_json, period, crawl_hash)
        VALUES (?, ?, ?, 'ontology-1', 0, 'bool', ?, ?, 'retained-run', 0.75, 'active', ?, '2026-q2', '2026-q2-de')`);
      db.transaction(() => {
        for (let n = 0; n < 10_000; n++) {
          const row = { ...observation, observation_id: `obs-${String(n).padStart(5, "0")}` };
          insert.run(
            row.observation_id,
            row.asset_id,
            row.signal_path,
            row.observed_at,
            row.recorded_at,
            JSON.stringify(row),
          );
        }
      })();
    });
    let count = 0;
    for await (const row of f.rows()) {
      expect(row.columns.id).toBe(`obs-${String(count++).padStart(5, "0")}`);
    }
    expect(count).toBe(10_000);
    let joined = 0;
    for await (const row of streamPreparedObservationIdentities(
      f.prepared,
      f.snapshot.uri,
      "canonical",
    )) {
      expect(row.source.observationLocator.id).toBe(`obs-${String(joined++).padStart(5, "0")}`);
      expect(row.identity.provisional_id).toBe("da-retained-site");
    }
    expect(joined).toBe(10_000);
    const empty = await fixture((db) => db.exec("DELETE FROM observations"));
    expect(await collect(empty.rows())).toEqual([]);
  });
});

describe("snapshot-bound observation identity references", () => {
  it.each(["provisional", "canonical"] as const)(
    "resolves explicitly declared %s IDs without changing signed source bytes",
    async (namespace) => {
      const f = await fixture((db) => {
        if (namespace === "provisional") {
          const signed = signObservation({ ...observation, asset_id: "da-retained-site" }, key);
          db.prepare(
            "UPDATE observations SET asset_id=?, obs_json=?, signature=?, signed_at=?",
          ).run(
            signed.asset_id,
            JSON.stringify(signed, null, 2),
            signed.signature,
            signed.signed_at,
          );
        }
      }, true);
      const before = await inventorySources({ roots: [f.source] });
      const [raw] = await collect(f.rows());
      const [row] = await collect(
        streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, namespace),
      );
      expect(row.observation).toEqual(raw);
      expect(row.identity).toEqual({
        provisional_id: "da-retained-site",
        canonical_id: observation.asset_id,
        domain: "retained.example",
        first_seen: "2026-05-03T11:00:00Z",
      });
      expect(row.source).toEqual({
        manifestSha256: f.prepared.manifestSha256,
        artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
        observationLocator: { table: "observations", id },
        identityLocator: { table: "asset_id_map", provisional_id: "da-retained-site" },
        assetIdNamespace: namespace,
      });
      for (const value of [
        row,
        row.identity,
        row.source,
        row.source.artifact,
        row.source.observationLocator,
        row.source.identityLocator,
      ])
        expect(Object.isFrozen(value)).toBe(true);
      expect(await inventorySources({ roots: [f.source] })).toEqual(before);
      expect((await verifyReplicas(f.options)).status).toBe("pass");
    },
  );

  it("never infers the namespace or accepts a forged preparation", async () => {
    const f = await fixture();
    const lstat = vi.spyOn(fs, "lstat");
    expect(() =>
      streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "auto" as "canonical"),
    ).toThrow("EXPLICIT_SOURCE_ASSET_ID_NAMESPACE_REQUIRED");
    expect(() =>
      streamPreparedObservationIdentities({ ...f.prepared }, f.snapshot.uri, "canonical"),
    ).toThrow("PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED");
    expect(lstat).not.toHaveBeenCalled();
    await expect(
      collect(streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "provisional")),
    ).rejects.toThrow("UNRESOLVED_OBSERVATION_IDENTITY");
  });

  it.each([
    ["missing mapping", "DELETE FROM asset_id_map", "UNRESOLVED_OBSERVATION_IDENTITY"],
    [
      "extra schema column",
      "ALTER TABLE asset_id_map ADD COLUMN device TEXT",
      "UNSUPPORTED_IDENTITY_SOURCE_SCHEMA",
    ],
    ["missing schema", "DROP TABLE asset_id_map", "UNSUPPORTED_IDENTITY_SOURCE_SCHEMA"],
    [
      "view",
      "ALTER TABLE asset_id_map RENAME TO hidden_map; CREATE VIEW asset_id_map AS SELECT * FROM hidden_map",
      "UNSUPPORTED_IDENTITY_SOURCE_SCHEMA",
    ],
    [
      "nonunique index",
      "DROP INDEX aim_canonical_idx; CREATE INDEX aim_canonical_idx ON asset_id_map(canonical_id)",
      "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    ],
    [
      "partial index",
      "DROP INDEX aim_canonical_idx; CREATE UNIQUE INDEX aim_canonical_idx ON asset_id_map(canonical_id) WHERE domain<>''",
      "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    ],
    [
      "case-insensitive index",
      "DROP INDEX aim_canonical_idx; CREATE UNIQUE INDEX aim_canonical_idx ON asset_id_map(canonical_id COLLATE NOCASE)",
      "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    ],
    [
      "descending index",
      "DROP INDEX aim_canonical_idx; CREATE UNIQUE INDEX aim_canonical_idx ON asset_id_map(canonical_id DESC)",
      "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    ],
    [
      "composite index",
      "DROP INDEX aim_canonical_idx; CREATE UNIQUE INDEX aim_canonical_idx ON asset_id_map(canonical_id,domain)",
      "UNSUPPORTED_IDENTITY_SOURCE_INDEX",
    ],
    [
      "NULL key",
      "UPDATE asset_id_map SET provisional_id=NULL",
      "INVALID_OR_OVERSIZED_IDENTITY_SOURCE_ROW",
    ],
    [
      "binary domain",
      "UPDATE asset_id_map SET domain=X'61'",
      "INVALID_OR_OVERSIZED_IDENTITY_SOURCE_ROW",
    ],
    ["empty key", "UPDATE asset_id_map SET provisional_id=' '", "INVALID_IDENTITY_SOURCE_KEY"],
    [
      "control key",
      "UPDATE asset_id_map SET provisional_id=char(0)||'hidden'",
      "INVALID_IDENTITY_SOURCE_KEY",
    ],
    ["bad UTF-8", "UPDATE asset_id_map SET domain=CAST(X'80' AS TEXT)", "encoded data"],
  ])("rejects %s instead of losing or reattributing observations", async (_label, sql, failure) => {
    const f = await fixture((db) => db.exec(sql));
    const close = vi.spyOn(Database.prototype, "close");
    await expect(
      collect(streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "canonical")),
    ).rejects.toThrow(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("validates canonical UUID syntax without inventing a replacement", async () => {
    const f = await fixture((db) => {
      db.prepare("UPDATE asset_id_map SET provisional_id=?,canonical_id='not-a-uuid'").run(
        observation.asset_id,
      );
    });
    await expect(
      collect(streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "provisional")),
    ).rejects.toThrow("INVALID_BASELINE_INPUT: canonicalId");
  });

  it("resolves overlapping alias and canonical namespaces only as explicitly declared", async () => {
    const f = await fixture((db) =>
      db
        .prepare("INSERT INTO asset_id_map VALUES (?, ?, ?, ?)")
        .run(observation.asset_id, "0198F000-0000-7000-8000-000000000003", "other.example", ""),
    );
    const [canonical] = await collect(
      streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "canonical"),
    );
    const [provisional] = await collect(
      streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "provisional"),
    );
    expect(canonical.identity.canonical_id).toBe(observation.asset_id);
    expect(provisional.identity.canonical_id).toBe("0198F000-0000-7000-8000-000000000003");
    expect(canonical.observation).toEqual(provisional.observation);
    expect(canonical.source.assetIdNamespace).not.toBe(provisional.source.assetIdNamespace);
  });

  it.each(["provisional_id", "canonical_id", "domain", "first_seen"])(
    "rejects oversized %s before transferring identity cells",
    async (column) => {
      const f = await fixture((db) => {
        if (column === "canonical_id")
          db.prepare("UPDATE asset_id_map SET provisional_id=?").run(observation.asset_id);
        db.prepare(`UPDATE asset_id_map SET "${column}"=?`).run("я".repeat(2049));
      });
      const prepare = Database.prototype.prepare;
      let sentinelSeen = false;
      vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
        this: Database.Database,
        sql: string,
      ) {
        const statement = prepare.call(this, sql);
        if (sql.startsWith("SELECT CASE WHEN") && sql.includes("FROM asset_id_map")) {
          const get = statement.get.bind(statement);
          vi.spyOn(statement, "get").mockImplementation((...args: unknown[]) => {
            const row = Reflect.apply(get, statement, args);
            expect(row).toEqual({
              admissible: 0,
              provisional_id: null,
              canonical_id: null,
              domain: null,
              first_seen: null,
            });
            sentinelSeen = true;
            return row;
          });
        }
        return statement;
      });
      await expect(
        collect(
          streamPreparedObservationIdentities(
            f.prepared,
            f.snapshot.uri,
            column === "canonical_id" ? "provisional" : "canonical",
          ),
        ),
      ).rejects.toThrow("INVALID_OR_OVERSIZED_IDENTITY_SOURCE_ROW");
      expect(sentinelSeen).toBe(true);
    },
  );

  it("preserves blank historical metadata rather than substituting a measurement time or domain", async () => {
    const f = await fixture((db) => db.exec("UPDATE asset_id_map SET domain='', first_seen=''"));
    const [row] = await collect(
      streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "canonical"),
    );
    expect(row.identity.domain).toBe("");
    expect(row.identity.first_seen).toBe("");
    expect(row.observation.payload.observed_at).toBe("2026-05-02T10:00:00+02:00");
  });

  it("keeps identical observation and alias keys in different snapshots distinctly attributable", async () => {
    const first = await fixture();
    const second = await fixture((db) => db.exec("UPDATE asset_id_map SET domain='other.example'"));
    const [a] = await collect(
      streamPreparedObservationIdentities(first.prepared, first.snapshot.uri, "canonical"),
    );
    const [b] = await collect(
      streamPreparedObservationIdentities(second.prepared, second.snapshot.uri, "canonical"),
    );
    expect(a.source.observationLocator).toEqual(b.source.observationLocator);
    expect(a.source.identityLocator).toEqual(b.source.identityLocator);
    expect(a.source.artifact.sha256).not.toBe(b.source.artifact.sha256);
    expect(a.source.manifestSha256).not.toBe(b.source.manifestSha256);
    expect(a.identity.domain).toBe("retained.example");
    expect(b.identity.domain).toBe("other.example");
  });

  it.each(["exhaustion", "early return"])("rehashes the joined snapshot on %s", async (finish) => {
    const f = await fixture();
    const rows = streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "canonical");
    expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(finish === "exhaustion" ? rows.next() : rows.return(undefined)).rejects.toThrow(
      "OBSERVATION_SNAPSHOT_CHANGED",
    );
  });

  it("does not manufacture an identity result when there are no observations", async () => {
    const f = await fixture((db) => db.exec("DELETE FROM observations"));
    expect(
      await collect(streamPreparedObservationIdentities(f.prepared, f.snapshot.uri, "canonical")),
    ).toEqual([]);
  });
});
