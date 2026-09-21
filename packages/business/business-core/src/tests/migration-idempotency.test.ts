import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrateCore, stampCoreMeta } from "../migrate/core.js";
import { migrateLiveness, stampLivenessMeta } from "../migrate/liveness.js";

describe("migration idempotency", () => {
  it("migrateCore runs twice without error", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    migrateCore(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.some((t) => t.name === "sites")).toBe(true);
    expect(tables.some((t) => t.name === "site_source_seeds")).toBe(true);
    db.close();
  });

  it("migrateLiveness runs twice without error", () => {
    const db = new Database(":memory:");
    migrateLiveness(db);
    migrateLiveness(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.some((t) => t.name === "liveness_checks")).toBe(true);
    db.close();
  });

  it("stampCoreMeta writes a row into _schema_meta", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    stampCoreMeta(db, "test-core", "1.0.0");
    const row = db.prepare("SELECT owner_app, schema_version FROM _schema_meta LIMIT 1").get() as {
      owner_app: string;
      schema_version: string;
    };
    expect(row.owner_app).toBe("test-core");
    expect(row.schema_version).toBe("1.0.0");
    db.close();
  });

  it("stampLivenessMeta writes a row into _schema_meta", () => {
    const db = new Database(":memory:");
    migrateLiveness(db);
    stampLivenessMeta(db, "test-liveness", "1.0.0");
    const row = db.prepare("SELECT owner_app, schema_version FROM _schema_meta LIMIT 1").get() as {
      owner_app: string;
      schema_version: string;
    };
    expect(row.owner_app).toBe("test-liveness");
    expect(row.schema_version).toBe("1.0.0");
    db.close();
  });

  it("stampSchemaMeta can be called twice (INSERT OR REPLACE)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    stampCoreMeta(db, "test-core", "1.0.0");
    stampCoreMeta(db, "test-core", "1.1.0");
    const rows = db
      .prepare("SELECT schema_version FROM _schema_meta ORDER BY rowid DESC LIMIT 1")
      .all() as { schema_version: string }[];
    expect(rows[0].schema_version).toBe("1.1.0");
    db.close();
  });

  it("migrateCore creates _schema_meta table", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.some((t) => t.name === "_schema_meta")).toBe(true);
    db.close();
  });
});
