import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore, migrateLiveness } from "@syrokomskyi/business-core/migrate";
import { loadLiveAuditTargets } from "../lib/audit-targets.js";

/**
 * Tests cross-quarter liveness state changes and their effect on audit target
 * inclusion. The registry DB is year-scoped (accumulates across quarters), but
 * the liveness DB is quarter-scoped (fresh per quarter). This means:
 *
 * - A site live in Q2 but dead in Q3 → excluded from Q3 audit (fresh liveness DB)
 * - A site dead in Q2 but live in Q3 → included in Q3 audit (fresh liveness DB)
 * - A site live in both Q2 and Q3 → included in Q3 audit
 * - A site dead in both Q2 and Q3 → excluded from Q3 audit
 * - Fresh quarter with no liveness data → no targets (all unknown)
 *
 * The registry (year-scoped) always has the same sites — the liveness DB
 * determines which are live THIS quarter.
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

const setupRegistry = (
  db: Database.Database,
  rows: Array<{ id: number; da_id: string; domain: string; bundesland: string | null }>,
) => {
  db.exec(REGISTRY_DDL);
  for (const r of rows) {
    db.prepare("INSERT INTO sites (id, domain, bundesland) VALUES (?, ?, ?)").run(r.id, r.domain, r.bundesland);
    db.prepare(
      "INSERT INTO business_registry (da_id, domain, bundesland, first_seen_source_token, first_seen_device_id) VALUES (?, ?, ?, 'token', 'device-a')",
    ).run(r.da_id, r.domain, r.bundesland);
  }
};

const setupLiveness = (
  db: Database.Database,
  rows: Array<{ siteId: number; assetId: string; domain: string; isLive: boolean }>,
) => {
  for (const r of rows) {
    db.prepare(
      "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
    ).run(r.siteId, r.assetId, r.domain, r.isLive ? 1 : 0);
  }
};

const SITES = [
  { id: 1, da_id: "da-live-always", domain: "live-always.de", bundesland: null },
  { id: 2, da_id: "da-dead-always", domain: "dead-always.de", bundesland: null },
  { id: 3, da_id: "da-live-q2-dead-q3", domain: "live-q2-dead-q3.de", bundesland: null },
  { id: 4, da_id: "da-dead-q2-live-q3", domain: "dead-q2-live-q3.de", bundesland: null },
];

describe("cross-quarter liveness state changes", () => {
  it("Q2 audit: includes sites live in Q2, excludes dead in Q2", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const q2Liveness = new Database(":memory:");
    migrateLiveness(q2Liveness);
    setupLiveness(q2Liveness, [
      { siteId: 1, assetId: "da-live-always", domain: "live-always.de", isLive: true },
      { siteId: 2, assetId: "da-dead-always", domain: "dead-always.de", isLive: false },
      { siteId: 3, assetId: "da-live-q2-dead-q3", domain: "live-q2-dead-q3.de", isLive: true },
      { siteId: 4, assetId: "da-dead-q2-live-q3", domain: "dead-q2-live-q3.de", isLive: false },
    ]);

    const targets = loadLiveAuditTargets(registryDb, q2Liveness, 0, "test");
    const domains = targets.map((t) => t.domain).sort();
    expect(domains).toEqual(["live-always.de", "live-q2-dead-q3.de"]);

    registryDb.close();
    q2Liveness.close();
  });

  it("Q3 audit: includes sites live in Q3, excludes dead in Q3 (fresh liveness DB)", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 1, assetId: "da-live-always", domain: "live-always.de", isLive: true },
      { siteId: 2, assetId: "da-dead-always", domain: "dead-always.de", isLive: false },
      { siteId: 3, assetId: "da-live-q2-dead-q3", domain: "live-q2-dead-q3.de", isLive: false },
      { siteId: 4, assetId: "da-dead-q2-live-q3", domain: "dead-q2-live-q3.de", isLive: true },
    ]);

    const targets = loadLiveAuditTargets(registryDb, q3Liveness, 0, "test");
    const domains = targets.map((t) => t.domain).sort();
    expect(domains).toEqual(["dead-q2-live-q3.de", "live-always.de"]);

    registryDb.close();
    q3Liveness.close();
  });

  it("site live in Q2 but dead in Q3 → excluded from Q3 audit", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 3, assetId: "da-live-q2-dead-q3", domain: "live-q2-dead-q3.de", isLive: false },
    ]);

    const targets = loadLiveAuditTargets(registryDb, q3Liveness, 0, "test");
    expect(targets.find((t) => t.domain === "live-q2-dead-q3.de")).toBeUndefined();

    registryDb.close();
    q3Liveness.close();
  });

  it("site dead in Q2 but live in Q3 → included in Q3 audit", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 4, assetId: "da-dead-q2-live-q3", domain: "dead-q2-live-q3.de", isLive: true },
    ]);

    const targets = loadLiveAuditTargets(registryDb, q3Liveness, 0, "test");
    expect(targets.find((t) => t.domain === "dead-q2-live-q3.de")).toBeDefined();

    registryDb.close();
    q3Liveness.close();
  });

  it("site live in both Q2 and Q3 → included in both audits", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    // Q2
    const q2Liveness = new Database(":memory:");
    migrateLiveness(q2Liveness);
    setupLiveness(q2Liveness, [
      { siteId: 1, assetId: "da-live-always", domain: "live-always.de", isLive: true },
    ]);
    const q2Targets = loadLiveAuditTargets(registryDb, q2Liveness, 0, "test");
    expect(q2Targets.find((t) => t.domain === "live-always.de")).toBeDefined();

    // Q3 (fresh DB)
    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 1, assetId: "da-live-always", domain: "live-always.de", isLive: true },
    ]);
    const q3Targets = loadLiveAuditTargets(registryDb, q3Liveness, 0, "test");
    expect(q3Targets.find((t) => t.domain === "live-always.de")).toBeDefined();

    registryDb.close();
    q2Liveness.close();
    q3Liveness.close();
  });

  it("site dead in both Q2 and Q3 → excluded from both audits", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const q2Liveness = new Database(":memory:");
    migrateLiveness(q2Liveness);
    setupLiveness(q2Liveness, [
      { siteId: 2, assetId: "da-dead-always", domain: "dead-always.de", isLive: false },
    ]);
    expect(loadLiveAuditTargets(registryDb, q2Liveness, 0, "test").find((t) => t.domain === "dead-always.de")).toBeUndefined();

    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 2, assetId: "da-dead-always", domain: "dead-always.de", isLive: false },
    ]);
    expect(loadLiveAuditTargets(registryDb, q3Liveness, 0, "test").find((t) => t.domain === "dead-always.de")).toBeUndefined();

    registryDb.close();
    q2Liveness.close();
    q3Liveness.close();
  });

  it("fresh quarter with empty liveness DB → zero targets (no site has been checked yet)", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const freshLiveness = new Database(":memory:");
    migrateLiveness(freshLiveness);
    // No liveness_checks rows at all

    const targets = loadLiveAuditTargets(registryDb, freshLiveness, 0, "test");
    expect(targets).toHaveLength(0);

    registryDb.close();
    freshLiveness.close();
  });

  it("registry has sites from Q2 and Q3 — both visible to Q3 audit (cumulative discovery)", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, [
      { id: 10, da_id: "da-q2-site", domain: "q2-site.de", bundesland: null },
      { id: 11, da_id: "da-q3-site", domain: "q3-site.de", bundesland: null },
    ]);

    const q3Liveness = new Database(":memory:");
    migrateLiveness(q3Liveness);
    setupLiveness(q3Liveness, [
      { siteId: 10, assetId: "da-q2-site", domain: "q2-site.de", isLive: true },
      { siteId: 11, assetId: "da-q3-site", domain: "q3-site.de", isLive: true },
    ]);

    const targets = loadLiveAuditTargets(registryDb, q3Liveness, 0, "test");
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.domain).sort()).toEqual(["q2-site.de", "q3-site.de"]);

    registryDb.close();
    q3Liveness.close();
  });

  it("partial liveness check — only some sites checked, unchecked sites excluded", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    setupRegistry(registryDb, SITES);

    const partialLiveness = new Database(":memory:");
    migrateLiveness(partialLiveness);
    // Only site 1 and 3 have been checked; site 2 and 4 are unknown
    setupLiveness(partialLiveness, [
      { siteId: 1, assetId: "da-live-always", domain: "live-always.de", isLive: true },
      { siteId: 3, assetId: "da-live-q2-dead-q3", domain: "live-q2-dead-q3.de", isLive: false },
    ]);

    const targets = loadLiveAuditTargets(registryDb, partialLiveness, 0, "test");
    // Only site 1 is live; site 3 is dead; sites 2 and 4 are not in liveness DB
    expect(targets).toHaveLength(1);
    expect(targets[0].domain).toBe("live-always.de");

    registryDb.close();
    partialLiveness.close();
  });
});
