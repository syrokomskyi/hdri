import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore, migrateLiveness, migrateAxe } from "@syrokomskyi/business-core/migrate";
import { loadLiveAuditTargets, upsertAuditRun, type AuditRunRow } from "../lib/audit-targets.js";

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

const setupRegistry = (
  db: Database.Database,
  rows: Array<{ id: number; da_id: string; domain: string; bundesland: string | null }>,
) => {
  db.exec(REGISTRY_DDL);
  for (const r of rows) {
    db.prepare("INSERT INTO sites (id, domain, bundesland) VALUES (?, ?, ?)").run(
      r.id,
      r.domain,
      r.bundesland,
    );
    db.prepare(
      "INSERT INTO business_registry (da_id, domain, bundesland, first_seen_source_token, first_seen_device_id) VALUES (?, ?, ?, 'token', 'device-a')",
    ).run(r.da_id, r.domain, r.bundesland);
  }
};

const setupLiveness = (
  db: Database.Database,
  rows: Array<{ siteId: number; assetId: string; isLive: boolean }>,
) => {
  for (const r of rows) {
    db.prepare(
      "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
    ).run(r.siteId, r.assetId, "x.de", r.isLive ? 1 : 0);
  }
};

describe("loadLiveAuditTargets", () => {
  it("returns all live sites from registry joined with liveness", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [
      { id: 1, da_id: "da-a", domain: "a.de", bundesland: "Bayern" },
      { id: 2, da_id: "da-b", domain: "b.de", bundesland: null },
      { id: 3, da_id: "da-c", domain: "c.de", bundesland: "Sachsen" },
    ]);

    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [
      { siteId: 1, assetId: "da-a", isLive: true },
      { siteId: 2, assetId: "da-b", isLive: false },
      { siteId: 3, assetId: "da-c", isLive: true },
    ]);

    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.domain).sort()).toEqual(["a.de", "c.de"]);
    registryDb.close();
    livenessDb.close();
  });

  it("includes sites from previous quarters (no quarter filter on registry)", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [
      { id: 10, da_id: "da-q2-site", domain: "q2-site.de", bundesland: null },
      { id: 11, da_id: "da-q3-site", domain: "q3-site.de", bundesland: null },
    ]);

    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [
      { siteId: 10, assetId: "da-q2-site", isLive: true },
      { siteId: 11, assetId: "da-q3-site", isLive: true },
    ]);

    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.provisionalAssetId).sort()).toEqual(["da-q2-site", "da-q3-site"]);
    registryDb.close();
    livenessDb.close();
  });

  it("returns empty array when registry is empty", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, []);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toEqual([]);
    registryDb.close();
    livenessDb.close();
  });

  it("returns empty array when no sites are live", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [{ id: 1, da_id: "da-a", domain: "a.de", bundesland: null }]);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [{ siteId: 1, assetId: "da-a", isLive: false }]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toEqual([]);
    registryDb.close();
    livenessDb.close();
  });

  it("respects sampleSize limit", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [
      { id: 1, da_id: "da-a", domain: "a.de", bundesland: null },
      { id: 2, da_id: "da-b", domain: "b.de", bundesland: null },
      { id: 3, da_id: "da-c", domain: "c.de", bundesland: null },
    ]);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [
      { siteId: 1, assetId: "da-a", isLive: true },
      { siteId: 2, assetId: "da-b", isLive: true },
      { siteId: 3, assetId: "da-c", isLive: true },
    ]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 2, "test");
    expect(targets).toHaveLength(2);
    registryDb.close();
    livenessDb.close();
  });

  it("returns all targets when sampleSize is 0", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [
      { id: 1, da_id: "da-a", domain: "a.de", bundesland: null },
      { id: 2, da_id: "da-b", domain: "b.de", bundesland: null },
    ]);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [
      { siteId: 1, assetId: "da-a", isLive: true },
      { siteId: 2, assetId: "da-b", isLive: true },
    ]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toHaveLength(2);
    registryDb.close();
    livenessDb.close();
  });

  it("builds https:// URLs from domains", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [{ id: 1, da_id: "da-a", domain: "example.de", bundesland: null }]);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [{ siteId: 1, assetId: "da-a", isLive: true }]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets[0].url).toBe("https://example.de");
    registryDb.close();
    livenessDb.close();
  });

  it("carries bundesland from registry into audit targets", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [{ id: 1, da_id: "da-a", domain: "a.de", bundesland: "Bayern" }]);
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [{ siteId: 1, assetId: "da-a", isLive: true }]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets[0].bundesland).toBe("Bayern");
    registryDb.close();
    livenessDb.close();
  });

  it("excludes sites that exist in sites but not in business_registry (INNER JOIN)", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [{ id: 1, da_id: "da-a", domain: "a.de", bundesland: null }]);
    // Add a site without a business_registry entry
    registryDb.prepare("INSERT INTO sites (id, domain) VALUES (?, ?)").run(99, "orphan.de");
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);
    setupLiveness(livenessDb, [
      { siteId: 1, assetId: "da-a", isLive: true },
      { siteId: 99, assetId: "da-orphan", isLive: true },
    ]);
    const targets = loadLiveAuditTargets(registryDb, livenessDb, 0, "test");
    expect(targets).toHaveLength(1);
    expect(targets[0].domain).toBe("a.de");
    registryDb.close();
    livenessDb.close();
  });
});

describe("upsertAuditRun", () => {
  const baseRow: AuditRunRow = {
    tool: "axe",
    siteId: 1,
    provisionalAssetId: "da-a",
    url: "https://a.de",
    durationMs: 500,
    ok: true,
    errorClass: null,
    errorMessage: null,
    reportSha256: "abc123",
    source: "live",
  };

  it("inserts a new audit run", () => {
    const db = new Database(":memory:");
    migrateAxe(db);
    upsertAuditRun(db, baseRow);
    const rows = db
      .prepare("SELECT * FROM audit_runs WHERE tool = ? AND provisional_asset_id = ?")
      .all("axe", "da-a");
    expect(rows).toHaveLength(1);
    db.close();
  });

  it("upserts (replaces) an existing audit run for the same (tool, provisional_asset_id)", () => {
    const db = new Database(":memory:");
    migrateAxe(db);
    upsertAuditRun(db, baseRow);
    upsertAuditRun(db, { ...baseRow, ok: false, errorMessage: "timeout", durationMs: 999 });
    const rows = db
      .prepare("SELECT * FROM audit_runs WHERE tool = ? AND provisional_asset_id = ?")
      .all("axe", "da-a");
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.ok).toBe(0);
    expect(row.duration_ms).toBe(999);
    expect(row.error_message).toBe("timeout");
    db.close();
  });

  it("allows different tools (axe vs lighthouse) for the same asset", () => {
    const db = new Database(":memory:");
    migrateAxe(db);
    upsertAuditRun(db, baseRow);
    upsertAuditRun(db, { ...baseRow, tool: "lighthouse", reportSha256: "lh-hash" });
    const rows = db
      .prepare("SELECT * FROM audit_runs WHERE provisional_asset_id = ? ORDER BY tool")
      .all("da-a");
    expect(rows).toHaveLength(2);
    db.close();
  });

  it("does not duplicate the same (tool, provisional_asset_id) on re-run", () => {
    const db = new Database(":memory:");
    migrateAxe(db);
    upsertAuditRun(db, baseRow);
    upsertAuditRun(db, baseRow);
    upsertAuditRun(db, baseRow);
    const count = db
      .prepare("SELECT COUNT(*) c FROM audit_runs WHERE tool = ? AND provisional_asset_id = ?")
      .get("axe", "da-a") as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });
});
