import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { inventorySources } from "../../tools/preservation/inventory.js";
import {
  preserveQ2,
  prepareBaselineSource,
  verifyReplicas,
} from "../../tools/preservation/preserve.js";
import {
  streamPreparedHarvestSeeds,
  streamPreparedHarvestSites,
} from "../../tools/preservation/harvest-source.js";

const roots: string[] = [];
const handles: Database.Database[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of handles.splice(0)) if (db.open) db.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const key = { ...generateSigningKey(), signingKeyId: "seed-test", collectorId: "fixture" };
const json = ' { "name": "café", "opaque": [1, 2] }\n';
async function fixture(edit?: (db: Database.Database) => void, wal = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-seed-reader-"));
  roots.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const db = new Database(path.join(source, "core.db"));
  handles.push(db);
  if (wal) {
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
  }
  migrateCore(db);
  db.exec("INSERT INTO sites(id,domain) VALUES(1,'retained.example')");
  db.prepare(
    `INSERT INTO site_source_seeds VALUES
    (9007199254740993,1,'input/page.html','item-1',?,'Street','01234','City',NULL,'mail@example.test',
    'https://retained.example','category','https://source.example/profile',?,NULL)`,
  ).run("\uFEFFcafé\0🙂", json);
  edit?.(db);
  if (!wal) db.close();
  const destinations = [0, 1, 2].map((n) => ({
    path: path.join(root, `replica-${n}`),
    failureDomain: `fixture-${n}`,
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
    workRoot: path.join(root, "private"),
  };
  const prepared = await prepareBaselineSource(options);
  const snapshot = prepared.manifest.artifacts.find((a) => a.representation === "sqlite-snapshot")!;
  return {
    source,
    options,
    prepared,
    snapshot,
    file: path.join(prepared.root, snapshot.uri),
    rows: () => streamPreparedHarvestSeeds(prepared, snapshot.uri),
    sites: () => streamPreparedHarvestSites(prepared, snapshot.uri),
  };
}
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const row of rows) result.push(row);
  return result;
}

describe("complete retained site records", () => {
  it("guards aggregate size before transferring site text to the driver", async () => {
    const f = await fixture((db) =>
      db.exec(`UPDATE sites SET hwo_provenance=CAST(zeroblob(5000000) AS TEXT),
      gemeinde=CAST(zeroblob(5000000) AS TEXT)`),
    );
    const prepare = Database.prototype.prepare;
    let seen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.includes("FROM sites NOT INDEXED")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const row of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            expect(row).toEqual({
              admissible: 0n,
              id: null,
              domain: null,
              hwo_uid: null,
              hwo_confidence: null,
              hwo_provenance: null,
              bundesland: null,
              gemeinde: null,
              created_at: null,
            });
            seen = true;
            yield row;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.sites())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SITE_ROW");
    expect(seen).toBe(true);
  });
  it("streams all 10000 sites without requiring seeds or retaining a domain set", async () => {
    const f = await fixture((db) => {
      db.exec("DELETE FROM site_source_seeds; DELETE FROM sites");
      const insert = db.prepare("INSERT INTO sites(id,domain,created_at) VALUES(?,?,NULL)");
      db.transaction(() => {
        for (let id = 1; id <= 10000; id++) insert.run(id, `site-${id}.example`);
      })();
    });
    let count = 0;
    for await (const row of f.sites()) expect(row.columns.id).toBe(BigInt(++count));
    expect(count).toBe(10000);
    const close = vi.spyOn(Database.prototype, "close");
    const rows = f.sites();
    await rows.next();
    await rows.return(undefined);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("preserves all site fields from WAL, including sites without seeds and missing classification", async () => {
    const provenance = "\uFEFFhistorical\0é🙂";
    const f = await fixture((db) => {
      db.prepare(
        `UPDATE sites SET hwo_uid='A-01',hwo_confidence=0.875,hwo_provenance=?,
        bundesland='BE',gemeinde='001',created_at=-7`,
      ).run(provenance);
      db.exec(
        `INSERT INTO sites(id,domain,created_at) VALUES(9007199254740993,'unseeded.example',NULL)`,
      );
    }, true);
    const before = await inventorySources({ roots: [f.source] });
    const rows = await collect(f.sites());
    expect(rows.map((row) => row.columns)).toEqual([
      {
        id: 1n,
        domain: "retained.example",
        hwo_uid: "A-01",
        hwo_confidence: 0.875,
        hwo_provenance: provenance,
        bundesland: "BE",
        gemeinde: "001",
        created_at: -7n,
      },
      {
        id: 9007199254740993n,
        domain: "unseeded.example",
        hwo_uid: null,
        hwo_confidence: null,
        hwo_provenance: null,
        bundesland: null,
        gemeinde: null,
        created_at: null,
      },
    ]);
    expect(rows[1].source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      siteLocator: { table: "sites", id: "9007199254740993" },
    });
    for (const value of [
      rows[1],
      rows[1].columns,
      rows[1].source,
      rows[1].source.artifact,
      rows[1].source.siteLocator,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    [
      "extra column",
      "ALTER TABLE sites ADD COLUMN unknown TEXT",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "missing classification column",
      "ALTER TABLE sites DROP COLUMN hwo_provenance",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "view",
      "ALTER TABLE sites RENAME TO hidden_sites; CREATE VIEW sites AS SELECT * FROM hidden_sites",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    ["binary text", "UPDATE sites SET hwo_uid=X'80'", "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW"],
    ["invalid UTF8", "UPDATE sites SET hwo_provenance=CAST(X'80' AS TEXT)", "encoded data"],
    [
      "non-numeric confidence",
      "UPDATE sites SET hwo_confidence='unknown'",
      "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW",
    ],
    ["infinite confidence", "UPDATE sites SET hwo_confidence=1e999", "INVALID_HARVEST_SITE_CELL"],
    ["fractional time", "UPDATE sites SET created_at=1.5", "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW"],
    [
      "oversized provenance",
      "UPDATE sites SET hwo_provenance=CAST(zeroblob(8388609) AS TEXT)",
      "INVALID_OR_OVERSIZED_HARVEST_SITE_ROW",
    ],
  ])("rejects %s without silently substituting historical values", async (_label, sql, error) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.sites())).rejects.toThrow(error);
  });
  it("does not impose new classification semantics on finite historical values", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE sites SET domain='',hwo_uid='',hwo_provenance='not JSON',hwo_confidence=2"),
    );
    const [row] = await collect(f.sites());
    expect(row.columns).toMatchObject({
      domain: "",
      hwo_uid: "",
      hwo_provenance: "not JSON",
      hwo_confidence: 2,
    });
  });
  it("reads sites independently of seed availability and preserves empty tables", async () => {
    const f = await fixture((db) => db.exec("DROP TABLE site_source_seeds"));
    expect(await collect(f.sites())).toHaveLength(1);
    const empty = await fixture((db) => db.exec("DELETE FROM sites"));
    expect(await collect(empty.sites())).toEqual([]);
    await expect(collect(empty.rows())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SOURCE_ROW");
  });
  it("requires a process-prepared snapshot, not cloned metadata or an original", async () => {
    const f = await fixture();
    expect(() => streamPreparedHarvestSites({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => streamPreparedHarvestSites(f.prepared, original.uri)).toThrow(
      "DECLARED_HARVEST_SNAPSHOT_REQUIRED",
    );
  });
  it.each(["before", "exhaustion", "return"])("rehashes the site snapshot on %s", async (when) => {
    const f = await fixture();
    const rows = f.sites();
    if (when !== "before") expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(when === "return" ? rows.return(undefined) : rows.next()).rejects.toThrow(
      "HARVEST_SNAPSHOT_CHANGED",
    );
  });
});

describe("retained harvest seeds", () => {
  it("rejects indexed INTEGER PRIMARY KEY DESC rather than assuming a rowid alias", async () => {
    const f = await fixture((db) => {
      db.exec(
        "DROP TABLE sites; CREATE TABLE sites(id INTEGER PRIMARY KEY DESC,domain TEXT NOT NULL)",
      );
    });
    await expect(collect(f.rows())).rejects.toThrow("UNSUPPORTED_HARVEST_SOURCE_SCHEMA");
  });
  it("transfers only a small sentinel for oversized rows, including an oversized joined domain", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE sites SET domain=CAST(zeroblob(8388609) AS TEXT)"),
    );
    const prepare = Database.prototype.prepare;
    let seen = false;
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (sql.includes("FROM site_source_seeds AS s")) {
        const iterate = statement.iterate.bind(statement);
        vi.spyOn(statement, "iterate").mockImplementation(function* () {
          for (const row of Reflect.apply(iterate, statement, []) as Iterable<
            Record<string, unknown>
          >) {
            expect(row.admissible).toBe(0n);
            expect(
              Object.entries(row)
                .filter(([name]) => name !== "admissible")
                .every(([, value]) => value === null),
            ).toBe(true);
            seen = true;
            yield row;
          }
        });
      }
      return statement;
    });
    await expect(collect(f.rows())).rejects.toThrow("INVALID_OR_OVERSIZED_HARVEST_SOURCE_ROW");
    expect(seen).toBe(true);
  });
  it("preserves WAL-only fields, exact integers, Unicode, nulls and raw text without changing originals or replicas", async () => {
    const f = await fixture(undefined, true);
    const before = await inventorySources({ roots: [f.source] });
    const [row] = await collect(f.rows());
    expect(row.columns).toEqual({
      id: 9007199254740993n,
      site_id: 1n,
      source_path: "input/page.html",
      source_item_key: "item-1",
      business_name: "\uFEFFcafé\0🙂",
      street_address: "Street",
      postal_code: "01234",
      city: "City",
      phone: null,
      email: "mail@example.test",
      website_url: "https://retained.example",
      category: "category",
      source_profile_url: "https://source.example/profile",
      raw_json: json,
      created_at: null,
    });
    expect(row.domain).toBe("retained.example");
    expect(row.source).toEqual({
      manifestSha256: f.prepared.manifestSha256,
      artifact: { uri: f.snapshot.uri, sha256: f.snapshot.sha256, bytes: f.snapshot.bytes },
      seedLocator: { table: "site_source_seeds", id: "9007199254740993" },
      siteLocator: { table: "sites", id: "1" },
    });
    for (const obj of [
      row,
      row.columns,
      row.source,
      row.source.artifact,
      row.source.seedLocator,
      row.source.siteLocator,
    ])
      expect(Object.isFrozen(obj)).toBe(true);
    expect(await inventorySources({ roots: [f.source] })).toEqual(before);
    expect((await verifyReplicas(f.options)).status).toBe("pass");
  });
  it.each([
    ["orphan", "DELETE FROM sites", "INVALID_OR_OVERSIZED"],
    ["binary text", "UPDATE site_source_seeds SET raw_json=X'80'", "INVALID_OR_OVERSIZED"],
    ["invalid UTF8", "UPDATE site_source_seeds SET city=CAST(X'80' AS TEXT)", "encoded data"],
    ["wrong timestamp", "UPDATE site_source_seeds SET created_at=1.5", "INVALID_OR_OVERSIZED"],
    [
      "oversized payload",
      "UPDATE site_source_seeds SET raw_json=CAST(zeroblob(8388609) AS TEXT)",
      "INVALID_OR_OVERSIZED",
    ],
    [
      "extra column",
      "ALTER TABLE site_source_seeds ADD COLUMN unknown TEXT",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "view",
      "ALTER TABLE site_source_seeds RENAME TO seeds; CREATE VIEW site_source_seeds AS SELECT * FROM seeds",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
    [
      "site view",
      "ALTER TABLE sites RENAME TO old_sites; CREATE VIEW sites AS SELECT * FROM old_sites",
      "UNSUPPORTED_HARVEST_SOURCE_SCHEMA",
    ],
  ])("rejects %s rather than dropping a row", async (_label, sql, error) => {
    const f = await fixture((db) => db.exec(sql));
    await expect(collect(f.rows())).rejects.toThrow(error);
  });
  it("keeps opaque historical JSON and timestamps without reclassification", async () => {
    const f = await fixture((db) =>
      db.exec("UPDATE site_source_seeds SET raw_json='not JSON',created_at=-1"),
    );
    const [row] = await collect(f.rows());
    expect(row.columns.raw_json).toBe("not JSON");
    expect(row.columns.created_at).toBe(-1n);
  });
  it("rejects forged preparation and original artifact selection before opening SQLite", async () => {
    const f = await fixture();
    expect(() => streamPreparedHarvestSeeds({ ...f.prepared }, f.snapshot.uri)).toThrow(
      "PROCESS_LOCAL_PREPARED_SOURCE_REQUIRED",
    );
    const original = f.prepared.manifest.artifacts.find((a) => a.representation === "original")!;
    expect(() => streamPreparedHarvestSeeds(f.prepared, original.uri)).toThrow(
      "DECLARED_HARVEST_SNAPSHOT_REQUIRED",
    );
  });
  it.each(["before", "exhaustion", "return"])("detects changed snapshot on %s", async (when) => {
    const f = await fixture();
    const rows = f.rows();
    if (when !== "before") expect((await rows.next()).done).toBe(false);
    await fs.appendFile(f.file, "changed");
    await expect(when === "return" ? rows.return(undefined) : rows.next()).rejects.toThrow(
      "HARVEST_SNAPSHOT_CHANGED",
    );
  });
  it("does not deduplicate seeds sharing one domain; empty input remains empty", async () => {
    const f = await fixture((db) =>
      db.exec(`INSERT INTO site_source_seeds(site_id,source_path,source_item_key,raw_json)
      VALUES(1,'other.html','item-2','{}')`),
    );
    const rows = await collect(f.rows());
    expect(rows).toHaveLength(2);
    expect(rows[0].domain).toBe(rows[1].domain);
    expect(rows[0].source.seedLocator).not.toEqual(rows[1].source.seedLocator);
    const empty = await fixture((db) => db.exec("DELETE FROM site_source_seeds"));
    expect(await collect(empty.rows())).toEqual([]);
  });
  it("closes the private reader on early return without claiming completeness", async () => {
    const f = await fixture();
    const close = vi.spyOn(Database.prototype, "close");
    const rows = f.rows();
    await rows.next();
    await rows.return(undefined);
    expect(close).toHaveBeenCalledTimes(1);
    expect(await collect(f.rows())).toHaveLength(1);
  });
});
