import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore, migrateLiveness } from "@syrokomskyi/business-core/migrate";

/**
 * Tests that the liveness/crawl target loading queries (used by CheckLivenessGogol
 * and CrawlGogol) include ALL sites from the registry, not just sites from the
 * current quarter. This is the "cumulative discovery" guarantee — sites discovered
 * in Q2 are still in the registry in Q3 and get re-checked for liveness.
 *
 * The SQL under test:
 *   CheckLivenessGogol: SELECT s.id, s.domain, br.da_id FROM sites s
 *                       JOIN business_registry br ON br.domain = s.domain
 *   CrawlGogol: SELECT DISTINCT site_id, domain, provisional_asset_id
 *               FROM liveness_checks WHERE is_live = 1
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

const insertRegistrySite = (
  db: Database.Database,
  id: number,
  domain: string,
  daId: string,
  bundesland: string | null = null,
) => {
  db.prepare("INSERT INTO sites (id, domain, bundesland) VALUES (?, ?, ?)").run(
    id,
    domain,
    bundesland,
  );
  db.prepare(
    "INSERT INTO business_registry (da_id, domain, bundesland, first_seen_source_token, first_seen_device_id) VALUES (?, ?, ?, 'token', 'device-a')",
  ).run(daId, domain, bundesland);
};

describe("CheckLivenessGogol target loading — all sites from registry", () => {
  it("loads all sites from registry regardless of which quarter they were first seen", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    registryDb.exec(REGISTRY_DDL);

    insertRegistrySite(registryDb, 1, "q2-site.de", "da-q2");
    insertRegistrySite(registryDb, 2, "q3-site.de", "da-q3");
    insertRegistrySite(registryDb, 3, "q1-site.de", "da-q1");

    const sites = registryDb
      .prepare(
        `SELECT s.id, s.domain, br.da_id AS provisionalAssetId
         FROM sites s
         JOIN business_registry br ON br.domain = s.domain
         ORDER BY s.id`,
      )
      .all() as Array<{ id: number; domain: string; provisionalAssetId: string }>;

    expect(sites).toHaveLength(3);
    expect(sites.map((s) => s.domain)).toEqual(["q2-site.de", "q3-site.de", "q1-site.de"]);
    registryDb.close();
  });

  it("returns empty when registry has no sites", () => {
    const registryDb = new Database(":memory:");
    migrateCore(registryDb);
    registryDb.exec(REGISTRY_DDL);

    const sites = registryDb
      .prepare(
        `SELECT s.id, s.domain, br.da_id AS provisionalAssetId
         FROM sites s
         JOIN business_registry br ON br.domain = s.domain`,
      )
      .all();

    expect(sites).toHaveLength(0);
    registryDb.close();
  });
});

describe("CrawlGogol target loading — all live sites from liveness DB", () => {
  it("loads all live sites from the quarter-scoped liveness DB", () => {
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);

    const insert = livenessDb.prepare(
      "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
    );
    insert.run(1, "da-a", "a.de", 1);
    insert.run(2, "da-b", "b.de", 0);
    insert.run(3, "da-c", "c.de", 1);

    const sites = livenessDb
      .prepare(
        `SELECT DISTINCT site_id AS id, domain, provisional_asset_id AS provisionalAssetId
         FROM liveness_checks
         WHERE is_live = 1
         ORDER BY site_id`,
      )
      .all() as Array<{ id: number; domain: string; provisionalAssetId: string }>;

    expect(sites).toHaveLength(2);
    expect(sites.map((s) => s.domain)).toEqual(["a.de", "c.de"]);
    livenessDb.close();
  });

  it("includes sites that were originally discovered in Q2 (cumulative discovery)", () => {
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);

    const insert = livenessDb.prepare(
      "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
    );
    // Sites from Q2 that are still live — re-checked in Q3
    insert.run(10, "da-old-1", "old1.de", 1);
    insert.run(11, "da-old-2", "old2.de", 1);
    // New Q3 sites
    insert.run(12, "da-new-1", "new1.de", 1);
    insert.run(13, "da-new-2", "new2.de", 0);

    const sites = livenessDb
      .prepare(
        `SELECT DISTINCT site_id AS id, domain, provisional_asset_id AS provisionalAssetId
         FROM liveness_checks
         WHERE is_live = 1
         ORDER BY site_id`,
      )
      .all() as Array<{ id: number; domain: string; provisionalAssetId: string }>;

    expect(sites).toHaveLength(3);
    expect(sites.map((s) => s.domain)).toEqual(["old1.de", "old2.de", "new1.de"]);
    livenessDb.close();
  });

  it("returns empty when no sites are live", () => {
    const livenessDb = new Database(":memory:");
    migrateLiveness(livenessDb);

    const insert = livenessDb.prepare(
      "INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live) VALUES (?, ?, ?, ?)",
    );
    insert.run(1, "da-a", "a.de", 0);

    const sites = livenessDb
      .prepare(
        `SELECT DISTINCT site_id AS id, domain, provisional_asset_id AS provisionalAssetId
         FROM liveness_checks
         WHERE is_live = 1`,
      )
      .all();

    expect(sites).toHaveLength(0);
    livenessDb.close();
  });
});

describe("audit gogol resume — skip already audited in same quarter", () => {
  it("skips sites already audited in the current quarter's audit_runs", () => {
    const auditsDb = new Database(":memory:");
    migrateLivenessAuditsForTest(auditsDb);

    // Simulate two sites already audited
    auditsDb
      .prepare(
        "INSERT INTO audit_runs (tool, site_id, provisional_asset_id, url, ok) VALUES (?, ?, ?, ?, ?)",
      )
      .run("axe", 1, "da-a", "https://a.de", 1);
    auditsDb
      .prepare(
        "INSERT INTO audit_runs (tool, site_id, provisional_asset_id, url, ok) VALUES (?, ?, ?, ?, ?)",
      )
      .run("axe", 2, "da-b", "https://b.de", 1);

    const auditedAssetIds = new Set(
      (
        auditsDb
          .prepare("SELECT provisional_asset_id FROM audit_runs WHERE tool = 'axe'")
          .all() as Array<{ provisional_asset_id: string }>
      ).map((r) => r.provisional_asset_id),
    );

    // Simulate 4 targets, 2 already audited
    const allTargets = [
      { provisionalAssetId: "da-a" },
      { provisionalAssetId: "da-b" },
      { provisionalAssetId: "da-c" },
      { provisionalAssetId: "da-d" },
    ];
    const pending = allTargets.filter((t) => !auditedAssetIds.has(t.provisionalAssetId));

    expect(pending).toHaveLength(2);
    expect(pending.map((t) => t.provisionalAssetId)).toEqual(["da-c", "da-d"]);
    auditsDb.close();
  });

  it("re-audits all sites in a fresh quarter (empty audit_runs)", () => {
    const auditsDb = new Database(":memory:");
    migrateLivenessAuditsForTest(auditsDb);

    const auditedAssetIds = new Set(
      (
        auditsDb
          .prepare("SELECT provisional_asset_id FROM audit_runs WHERE tool = 'axe'")
          .all() as Array<{ provisional_asset_id: string }>
      ).map((r) => r.provisional_asset_id),
    );

    const allTargets = [{ provisionalAssetId: "da-a" }, { provisionalAssetId: "da-b" }];
    const pending = allTargets.filter((t) => !auditedAssetIds.has(t.provisionalAssetId));

    expect(pending).toHaveLength(2);
    auditsDb.close();
  });
});

function migrateLivenessAuditsForTest(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tool            TEXT NOT NULL,
      site_id         INTEGER NOT NULL,
      provisional_asset_id TEXT NOT NULL,
      url             TEXT NOT NULL,
      fetched_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      duration_ms     INTEGER,
      ok              INTEGER NOT NULL DEFAULT 0,
      error_class     TEXT,
      error_message   TEXT,
      report_sha256   TEXT,
      source          TEXT NOT NULL DEFAULT 'live'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ar_tool_asset ON audit_runs(tool, provisional_asset_id);
  `);
}
