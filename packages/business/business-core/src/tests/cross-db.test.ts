import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { attachDatabase, detachDatabase } from "../cross-db.js";
import { migrateCore, stampCoreMeta } from "../migrate/core.js";
import { migrateLiveness, stampLivenessMeta } from "../migrate/liveness.js";
import { SchemaCompatError } from "../schema/schema-meta.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-db-test-"));
  dirs.push(dir);
  return dir;
};

const setupMainDb = (dir: string, owner = "test-core", version = "1.0.0") => {
  const mainPath = path.join(dir, "main.db");
  const db = new Database(mainPath);
  migrateCore(db);
  stampCoreMeta(db, owner, version);
  return { db, mainPath };
};

const setupLivenessDb = (dir: string, name = "other.db", owner = "test-liveness", version = "1.0.0") => {
  const otherPath = path.join(dir, name);
  const db = new Database(otherPath);
  migrateLiveness(db);
  stampLivenessMeta(db, owner, version);
  return { db, otherPath };
};

describe("attachDatabase", () => {
  it("attaches a compatible database and allows cross-DB queries", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir);
    otherDb
      .prepare(
        "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
      )
      .run(1, "da-test", "example.de", 1);
    otherDb.close();

    attachDatabase(mainDb, {
      alias: "liv",
      path: otherPath,
      expectedVersion: "1.0.0",
      expectedOwner: "test-liveness",
    });

    const rows = mainDb
      .prepare("SELECT domain FROM [liv].liveness_checks WHERE is_live = 1")
      .all() as { domain: string }[];
    expect(rows).toEqual([{ domain: "example.de" }]);

    detachDatabase(mainDb, "liv");
    mainDb.close();
  });

  it("throws SchemaCompatError on version major mismatch", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir, "v2.db", "test-liveness", "2.0.0");
    otherDb.close();

    expect(() =>
      attachDatabase(mainDb, {
        alias: "liv",
        path: otherPath,
        expectedVersion: "1.0.0",
      }),
    ).toThrow(SchemaCompatError);

    mainDb.close();
  });

  it("throws SchemaCompatError on owner mismatch", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir, "wrong-owner.db", "wrong-app", "1.0.0");
    otherDb.close();

    expect(() =>
      attachDatabase(mainDb, {
        alias: "liv",
        path: otherPath,
        expectedVersion: "1.0.0",
        expectedOwner: "test-liveness",
      }),
    ).toThrow(SchemaCompatError);

    mainDb.close();
  });

  it("throws SchemaCompatError when _schema_meta table is missing", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);

    const otherPath = path.join(dir, "no-meta.db");
    const otherDb = new Database(otherPath);
    otherDb.exec("CREATE TABLE dummy(x)");
    otherDb.close();

    expect(() =>
      attachDatabase(mainDb, {
        alias: "liv",
        path: otherPath,
        expectedVersion: "1.0.0",
      }),
    ).toThrow(SchemaCompatError);

    mainDb.close();
  });

  it("detaches on schema compat error, leaving main db clean", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir, "bad.db", "test-liveness", "2.0.0");
    otherDb.close();

    try {
      attachDatabase(mainDb, {
        alias: "liv",
        path: otherPath,
        expectedVersion: "1.0.0",
      });
    } catch {
      // expected
    }

    const attached = mainDb.prepare("PRAGMA database_list").all() as { name: string }[];
    expect(attached.some((r) => r.name === "liv")).toBe(false);

    mainDb.close();
  });

  it("enforces readonly mode by default (query_only prevents writes)", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir);
    otherDb.close();

    attachDatabase(mainDb, {
      alias: "liv",
      path: otherPath,
      expectedVersion: "1.0.0",
      expectedOwner: "test-liveness",
    });

    expect(() =>
      mainDb
        .prepare(
          "INSERT INTO [liv].liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
        )
        .run(2, "da-readonly", "test.de", 0),
    ).toThrow();

    detachDatabase(mainDb, "liv");
    mainDb.close();
  });

  it("allows writes when readonly is false", () => {
    const dir = tmpDir();
    const { db: mainDb } = setupMainDb(dir);
    const { db: otherDb, otherPath } = setupLivenessDb(dir);
    otherDb.close();

    attachDatabase(mainDb, {
      alias: "liv",
      path: otherPath,
      expectedVersion: "1.0.0",
      expectedOwner: "test-liveness",
      readonly: false,
    });

    expect(() =>
      mainDb
        .prepare(
          "INSERT INTO [liv].liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
        )
        .run(2, "da-write", "test.de", 0),
    ).not.toThrow();

    detachDatabase(mainDb, "liv");
    mainDb.close();
  });
});

describe("detachDatabase", () => {
  it("does not throw when alias was never attached", () => {
    const db = new Database(":memory:");
    expect(() => detachDatabase(db, "nonexistent")).not.toThrow();
    db.close();
  });
});
