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
import { streamPreparedHarvestSeeds } from "../../tools/preservation/harvest-source.js";

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
  };
}
async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const row of rows) result.push(row);
  return result;
}

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
