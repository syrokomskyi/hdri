import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrateRegistry, stampRegistryMeta } from "../db/schema.js";

describe("migrateRegistry", () => {
  it("runs twice without error (idempotent)", () => {
    const db = new Database(":memory:");
    migrateRegistry(db);
    migrateRegistry(db);
    db.close();
  });

  it("stampRegistryMeta writes a row into _schema_meta", () => {
    const db = new Database(":memory:");
    migrateRegistry(db);
    stampRegistryMeta(db, "1.0.0");
    const row = db.prepare("SELECT owner_app, schema_version FROM _schema_meta LIMIT 1").get() as {
      owner_app: string;
      schema_version: string;
    };
    expect(row.owner_app).toBe("register-businesses");
    expect(row.schema_version).toBe("1.0.0");
    db.close();
  });

  it("does not create registry_alias table", () => {
    const db = new Database(":memory:");
    migrateRegistry(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registry_alias'").all();
    expect(tables).toHaveLength(0);
    db.close();
  });

  it("creates business_registry table", () => {
    const db = new Database(":memory:");
    migrateRegistry(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_registry'").all();
    expect(tables).toHaveLength(1);
    db.close();
  });
});
