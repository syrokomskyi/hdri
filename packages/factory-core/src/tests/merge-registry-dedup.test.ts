import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore } from "@syrokomskyi/business-core/migrate";

const deriveAssetId = (domain: string): string => {
  const hash = createHash("sha256").update(`observatory:asset:${domain}`, "utf-8").digest("hex");
  return `da-${hash.slice(0, 32)}`;
};

/**
 * Tests the registry merge SQL logic (ON CONFLICT DO UPDATE with COALESCE/MAX)
 * that MergeRegistryGogol uses to deduplicate domains across devices and quarters.
 *
 * The SQL under test (from MergeRegistryGogol.ts:76-84):
 *   INSERT INTO business_registry
 *     (da_id, domain, bundesland, gemeinde, first_seen_source_token, first_seen_device_id, first_seen_at, sites_count)
 *   VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
 *   ON CONFLICT(da_id) DO UPDATE SET
 *     bundesland = COALESCE(excluded.bundesland, business_registry.bundesland),
 *     gemeinde   = COALESCE(excluded.gemeinde, business_registry.gemeinde),
 *     sites_count = MAX(business_registry.sites_count, excluded.sites_count)
 */

const REGISTRY_DDL = `
  CREATE TABLE IF NOT EXISTS business_registry (
    da_id                  TEXT PRIMARY KEY,
    domain                 TEXT NOT NULL UNIQUE,
    bundesland             TEXT,
    gemeinde               TEXT,
    first_seen_source_token TEXT NOT NULL,
    first_seen_device_id   TEXT NOT NULL,
    first_seen_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    sites_count            INTEGER NOT NULL DEFAULT 1
  );
`;

const insertRegistry = (db: Database.Database) =>
  db.prepare(`
    INSERT INTO business_registry
      (da_id, domain, bundesland, gemeinde, first_seen_source_token, first_seen_device_id, first_seen_at, sites_count)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
    ON CONFLICT(da_id) DO UPDATE SET
      bundesland = COALESCE(excluded.bundesland, business_registry.bundesland),
      gemeinde = COALESCE(excluded.gemeinde, business_registry.gemeinde),
      sites_count = MAX(business_registry.sites_count, excluded.sites_count)
  `);

type RegistryRow = {
  da_id: string;
  domain: string;
  bundesland: string | null;
  gemeinde: string | null;
  first_seen_source_token: string;
  first_seen_device_id: string;
  sites_count: number;
};

const getRow = (db: Database.Database, daId: string): RegistryRow =>
  db.prepare("SELECT * FROM business_registry WHERE da_id = ?").get(daId) as RegistryRow;

describe("registry merge — ON CONFLICT DO UPDATE", () => {
  it("inserts a new domain with its da_id, bundesland, and sites_count", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", "Bayern", "München", "2026-q2-de-01", "device-a", 1);
    const row = getRow(db, daId);
    expect(row.domain).toBe("example.de");
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");
    expect(row.sites_count).toBe(1);
    expect(row.first_seen_source_token).toBe("2026-q2-de-01");
    db.close();
  });

  it("does not duplicate an existing da_id — updates in place", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", "Bayern", "München", "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-b", 1);
    const count = db
      .prepare("SELECT COUNT(*) c FROM business_registry WHERE da_id = ?")
      .get(daId) as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it("preserves first_seen_source_token and first_seen_device_id on conflict", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", "Bayern", null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-b", 1);
    const row = getRow(db, daId);
    expect(row.first_seen_source_token).toBe("2026-q2-de-01");
    expect(row.first_seen_device_id).toBe("device-a");
    db.close();
  });

  it("fills in bundesland via COALESCE when the new row has it and the old row does not", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", "Bayern", null, "2026-q3-de-01", "device-b", 1);
    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Bayern");
    db.close();
  });

  it("does not overwrite a non-null bundesland with NULL via COALESCE", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", "Bayern", "München", "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-b", 1);
    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");
    db.close();
  });

  it("upgrades bundesland when the new row provides a value and the old row was NULL", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(
      daId,
      "example.de",
      "Sachsen",
      "Dresden",
      "2026-q3-de-01",
      "device-b",
      1,
    );
    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Sachsen");
    expect(row.gemeinde).toBe("Dresden");
    db.close();
  });

  it("takes the MAX sites_count across merges", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 3);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-b", 5);
    const row = getRow(db, daId);
    expect(row.sites_count).toBe(5);
    db.close();
  });

  it("does not decrease sites_count when a later merge has a smaller value", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 7);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-b", 2);
    const row = getRow(db, daId);
    expect(row.sites_count).toBe(7);
    db.close();
  });

  it("deduplicates domains across multiple devices (simulating Q2 + Q3 merge)", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    const sharedDomain = "shared.de";
    const daId = deriveAssetId(sharedDomain);

    insertRegistry(db).run(daId, sharedDomain, "Bayern", null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, sharedDomain, null, null, "2026-q3-de-01", "device-b", 1);

    const newDomain = "new.de";
    const newDaId = deriveAssetId(newDomain);
    insertRegistry(db).run(
      newDaId,
      newDomain,
      "Sachsen",
      "Leipzig",
      "2026-q3-de-01",
      "device-b",
      1,
    );

    const allRows = db
      .prepare("SELECT * FROM business_registry ORDER BY da_id")
      .all() as RegistryRow[];
    expect(allRows).toHaveLength(2);
    expect(allRows.find((r) => r.domain === sharedDomain)?.sites_count).toBe(1);
    expect(allRows.find((r) => r.domain === newDomain)?.bundesland).toBe("Sachsen");
    db.close();
  });

  it("produces the same da_id for the same domain regardless of when it is called (deterministic, no quarter input)", () => {
    const da1 = deriveAssetId("example.de");
    const da2 = deriveAssetId("example.de");
    const da3 = deriveAssetId("example.de");
    expect(da1).toBe(da2);
    expect(da1).toBe(da3);
  });
});

describe("registry sites table — ON CONFLICT DO UPDATE (downstream compatibility)", () => {
  it("updates bundesland/gemeinde via COALESCE in the sites table too", () => {
    const db = new Database(":memory:");
    migrateCore(db);

    const insertSite = db.prepare(`
      INSERT INTO sites (domain, hwo_uid, hwo_confidence, hwo_provenance, bundesland, gemeinde, created_at)
      VALUES (?, NULL, NULL, NULL, ?, ?, unixepoch())
      ON CONFLICT(domain) DO UPDATE SET
        bundesland = COALESCE(excluded.bundesland, sites.bundesland),
        gemeinde = COALESCE(excluded.gemeinde, sites.gemeinde)
    `);

    insertSite.run("example.de", null, null);
    insertSite.run("example.de", "Bayern", "München");

    const row = db
      .prepare("SELECT bundesland, gemeinde FROM sites WHERE domain = ?")
      .get("example.de") as {
      bundesland: string | null;
      gemeinde: string | null;
    };
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");

    insertSite.run("example.de", null, null);
    const row2 = db
      .prepare("SELECT bundesland, gemeinde FROM sites WHERE domain = ?")
      .get("example.de") as {
      bundesland: string | null;
      gemeinde: string | null;
    };
    expect(row2.bundesland).toBe("Bayern");
    expect(row2.gemeinde).toBe("München");

    db.close();
  });
});
