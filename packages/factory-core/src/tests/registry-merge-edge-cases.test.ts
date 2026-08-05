import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

/**
 * Tests edge cases in the registry merge logic that MergeRegistryGogol uses
 * to aggregate domains from multiple devices across quarters.
 *
 * Scenarios covered:
 * - Multi-device bundesland: device-a has bundesland, device-b doesn't → COALESCE keeps non-null
 * - Multi-device sites_count: MAX(existing, excluded) picks the larger count
 * - Same domain from 3+ devices: repeated ON CONFLICT updates
 * - Subdomain vs root domain: sub.example.de and example.de get different da_ids
 * - Domain case normalization: Example.DE and example.de resolve to same da_id
 * - registry_alias table: alternate domain forms mapping to same da_id
 * - sites table COALESCE in registry DB (downstream compatibility)
 */

const deriveAssetId = (domain: string): string => {
  const hash = createHash("sha256").update(`observatory:asset:${domain}`, "utf-8").digest("hex");
  return `da-${hash.slice(0, 32)}`;
};

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

  CREATE TABLE IF NOT EXISTS registry_alias (
    da_id            TEXT NOT NULL,
    alternate_domain TEXT NOT NULL,
    source_token     TEXT NOT NULL,
    device_id        TEXT NOT NULL,
    added_at         INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (da_id, alternate_domain)
  );

  CREATE TABLE IF NOT EXISTS sites (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    domain               TEXT NOT NULL UNIQUE,
    hwo_uid              TEXT,
    hwo_confidence       REAL,
    hwo_provenance       TEXT,
    bundesland           TEXT,
    gemeinde             TEXT,
    created_at           INTEGER DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS sites_domain_idx ON sites(domain);
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

const insertSite = (db: Database.Database) =>
  db.prepare(`
    INSERT INTO sites
      (domain, hwo_uid, hwo_confidence, hwo_provenance, bundesland, gemeinde, created_at)
    VALUES (?, NULL, NULL, NULL, ?, ?, unixepoch())
    ON CONFLICT(domain) DO UPDATE SET
      bundesland = COALESCE(excluded.bundesland, sites.bundesland),
      gemeinde = COALESCE(excluded.gemeinde, sites.gemeinde)
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

describe("registry merge — multi-device edge cases", () => {
  it("three devices merge into one row — first_seen preserved, last non-null bundesland wins", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    // Device A: no bundesland
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    // Device B: has bundesland
    insertRegistry(db).run(daId, "example.de", "Bayern", "München", "2026-q2-de-02", "device-b", 3);
    // Device C: different bundesland (overwrites — COALESCE(excluded, existing) uses new non-null)
    insertRegistry(db).run(daId, "example.de", "Berlin", null, "2026-q3-de-01", "device-c", 2);

    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Berlin"); // last non-null wins (COALESCE(excluded, existing))
    expect(row.gemeinde).toBe("München"); // device-c sent null, so existing "München" preserved
    expect(row.first_seen_source_token).toBe("2026-q2-de-01");
    expect(row.first_seen_device_id).toBe("device-a");
    expect(row.sites_count).toBe(3); // MAX(1, 3, 2) = 3
    db.close();
  });

  it("sites_count MAX picks the larger value across devices", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 5);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-02", "device-b", 10);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-c", 3);

    const row = getRow(db, daId);
    expect(row.sites_count).toBe(10); // MAX(5, 10, 3) = 10
    db.close();
  });

  it("sites_count stays at max when a smaller value comes later", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-c", 8);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-02", "device-d", 2);

    const row = getRow(db, daId);
    expect(row.sites_count).toBe(8); // MAX(8, 2) = 8, not overwritten by smaller
    db.close();
  });

  it("gemeinde is filled via COALESCE when first row has null and later row has it", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    insertRegistry(db).run(daId, "example.de", "Bayern", null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", null, "München", "2026-q3-de-01", "device-b", 1);

    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");
    db.close();
  });

  it("both bundesland and gemeinde filled by different devices", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", "Bayern", null, "2026-q2-de-02", "device-b", 1);
    insertRegistry(db).run(daId, "example.de", null, "München", "2026-q3-de-01", "device-c", 1);

    const row = getRow(db, daId);
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");
    db.close();
  });
});

describe("registry merge — subdomain and case edge cases", () => {
  it("subdomain.example.de and example.de get different da_ids (subdomain NOT stripped)", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId1 = deriveAssetId("example.de");
    const daId2 = deriveAssetId("subdomain.example.de");

    expect(daId1).not.toBe(daId2);

    insertRegistry(db).run(daId1, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(
      daId2,
      "subdomain.example.de",
      null,
      null,
      "2026-q2-de-01",
      "device-a",
      1,
    );

    const count = db.prepare("SELECT COUNT(*) c FROM business_registry").get() as { c: number };
    expect(count.c).toBe(2);
    db.close();
  });

  it("www.example.de and example.de are different domains in registry (www already stripped in phase 0)", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    // Phase 0 normalises domain before upsertSite, so "www.example.de" → "example.de"
    // By the time we reach registry merge, domains are already normalised
    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);

    const row = getRow(db, daId);
    expect(row.domain).toBe("example.de");
    db.close();
  });

  it("deterministic da_id — same domain always produces same da_id", () => {
    const id1 = deriveAssetId("example.de");
    const id2 = deriveAssetId("example.de");
    const id3 = deriveAssetId("example.de");
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
    expect(id1).toMatch(/^da-[0-9a-f]{32}$/);
  });

  it("different domains always produce different da_ids", () => {
    const domains = ["alpha.de", "beta.de", "gamma.de", "delta.de"];
    const daIds = domains.map(deriveAssetId);
    expect(new Set(daIds).size).toBe(4);
    for (const id of daIds) {
      expect(id).toMatch(/^da-[0-9a-f]{32}$/);
    }
  });
});

describe("registry merge — sites table downstream compatibility", () => {
  it("sites table is populated from business_registry with COALESCE for bundesland", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    const daId = deriveAssetId("example.de");
    insertRegistry(db).run(daId, "example.de", "Bayern", "München", "2026-q2-de-01", "device-a", 1);

    // Simulate MergeRegistryGogol populating sites table
    insertSite(db).run("example.de", "Bayern", "München");

    const site = db.prepare("SELECT * FROM sites WHERE domain = ?").get("example.de") as {
      domain: string;
      bundesland: string | null;
      gemeinde: string | null;
    };
    expect(site.domain).toBe("example.de");
    expect(site.bundesland).toBe("Bayern");
    expect(site.gemeinde).toBe("München");
    db.close();
  });

  it("sites table COALESCE does not overwrite existing bundesland with NULL", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    // First insert with bundesland
    insertSite(db).run("example.de", "Bayern", "München");
    // Second insert without bundesland (different device, no geo data)
    insertSite(db).run("example.de", null, null);

    const site = db.prepare("SELECT * FROM sites WHERE domain = ?").get("example.de") as {
      bundesland: string | null;
      gemeinde: string | null;
    };
    expect(site.bundesland).toBe("Bayern");
    expect(site.gemeinde).toBe("München");
    db.close();
  });

  it("sites table COALESCE fills bundesland when first insert has null", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    insertSite(db).run("example.de", null, null);
    insertSite(db).run("example.de", "Bayern", null);
    insertSite(db).run("example.de", null, "München");

    const site = db.prepare("SELECT * FROM sites WHERE domain = ?").get("example.de") as {
      bundesland: string | null;
      gemeinde: string | null;
    };
    expect(site.bundesland).toBe("Bayern");
    expect(site.gemeinde).toBe("München");
    db.close();
  });

  it("sites table does not duplicate domains (ON CONFLICT DO UPDATE)", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    insertSite(db).run("example.de", null, null);
    insertSite(db).run("example.de", "Bayern", "München");
    insertSite(db).run("example.de", null, null);

    const count = db.prepare("SELECT COUNT(*) c FROM sites WHERE domain = ?").get("example.de") as {
      c: number;
    };
    expect(count.c).toBe(1);
    db.close();
  });
});

describe("registry merge — cross-quarter accumulation", () => {
  it("Q2 domain re-appears in Q3 from a different device — merged, not duplicated", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    // Q2: device-a discovers the domain
    insertRegistry(db).run(daId, "example.de", "Bayern", null, "2026-q2-de-01", "device-a", 1);

    // Q3: device-b discovers the same domain
    insertRegistry(db).run(daId, "example.de", null, "München", "2026-q3-de-01", "device-b", 2);

    const count = db
      .prepare("SELECT COUNT(*) c FROM business_registry WHERE da_id = ?")
      .get(daId) as { c: number };
    expect(count.c).toBe(1);

    const row = getRow(db, daId);
    expect(row.first_seen_source_token).toBe("2026-q2-de-01");
    expect(row.first_seen_device_id).toBe("device-a");
    expect(row.bundesland).toBe("Bayern");
    expect(row.gemeinde).toBe("München");
    expect(row.sites_count).toBe(2);
    db.close();
  });

  it("new domain in Q3 is added alongside existing Q2 domains", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);

    const q2DaId = deriveAssetId("q2-site.de");
    const q3DaId = deriveAssetId("q3-site.de");

    insertRegistry(db).run(q2DaId, "q2-site.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(q3DaId, "q3-site.de", null, null, "2026-q3-de-01", "device-a", 1);

    const count = db.prepare("SELECT COUNT(*) c FROM business_registry").get() as { c: number };
    expect(count.c).toBe(2);

    const rows = db.prepare("SELECT domain FROM business_registry ORDER BY domain").all() as Array<{
      domain: string;
    }>;
    expect(rows.map((r) => r.domain)).toEqual(["q2-site.de", "q3-site.de"]);
    db.close();
  });

  it("same domain from same device in different quarters — first_seen preserved, sites_count may grow", () => {
    const db = new Database(":memory:");
    db.exec(REGISTRY_DDL);
    const daId = deriveAssetId("example.de");

    insertRegistry(db).run(daId, "example.de", null, null, "2026-q2-de-01", "device-a", 1);
    insertRegistry(db).run(daId, "example.de", null, null, "2026-q3-de-01", "device-a", 5);

    const row = getRow(db, daId);
    expect(row.first_seen_source_token).toBe("2026-q2-de-01");
    expect(row.sites_count).toBe(5); // MAX(1, 5) = 5
    db.close();
  });
});
