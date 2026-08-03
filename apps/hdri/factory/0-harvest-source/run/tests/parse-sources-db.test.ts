import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { upsertSite, upsertSourceSeed, insertSkippedSeed } from "../gogols/parse-sources-db.js";
import type { SourceBusinessSeed } from "../source-records.js";

const seed = (overrides: Partial<SourceBusinessSeed> = {}): SourceBusinessSeed => ({
  sourceItemKey: "key-1",
  sourcePageNumber: null,
  businessName: "Test GmbH",
  streetAddress: "Teststr. 1",
  postalCode: "10115",
  city: "Berlin",
  phone: null,
  email: null,
  websiteUrl: "https://example.de",
  category: null,
  sourceProfileUrl: null,
  raw: {},
  ...overrides,
});

describe("upsertSite", () => {
  it("inserts a new domain and returns its site_id", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const id = upsertSite(db, "example.de");
    expect(id).toBeGreaterThan(0);
    db.close();
  });

  it("does not duplicate an existing domain — returns the same site_id", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const id1 = upsertSite(db, "example.de");
    const id2 = upsertSite(db, "example.de");
    expect(id2).toBe(id1);
    const count = db.prepare("SELECT COUNT(*) c FROM sites WHERE domain = ?").get("example.de") as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it("assigns different site_ids to different domains", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const id1 = upsertSite(db, "alpha.de");
    const id2 = upsertSite(db, "beta.de");
    expect(id1).not.toBe(id2);
    db.close();
  });
});

describe("upsertSourceSeed", () => {
  it("inserts a new source seed for a site", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const siteId = upsertSite(db, "example.de");
    upsertSourceSeed(db, siteId, "2026-q2-de-01/source.csv", seed());
    const rows = db.prepare("SELECT * FROM site_source_seeds WHERE site_id = ?").all(siteId);
    expect(rows).toHaveLength(1);
    db.close();
  });

  it("does not duplicate the same (site_id, source_path, source_item_key)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const siteId = upsertSite(db, "example.de");
    const s = seed();
    upsertSourceSeed(db, siteId, "2026-q2-de-01/source.csv", s);
    upsertSourceSeed(db, siteId, "2026-q2-de-01/source.csv", s);
    const count = db
      .prepare("SELECT COUNT(*) c FROM site_source_seeds WHERE site_id = ? AND source_path = ? AND source_item_key = ?")
      .get(siteId, "2026-q2-de-01/source.csv", s.sourceItemKey) as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it("allows multiple provenance records from different quarters for the same site", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const siteId = upsertSite(db, "example.de");

    upsertSourceSeed(db, siteId, "2026-q2-de-01/source.csv", seed({ sourceItemKey: "q2-key" }));
    upsertSourceSeed(db, siteId, "2026-q3-de-01/newsource.csv", seed({ sourceItemKey: "q3-key" }));

    const rows = db
      .prepare("SELECT source_path, source_item_key FROM site_source_seeds WHERE site_id = ? ORDER BY source_path")
      .all(siteId) as Array<{ source_path: string; source_item_key: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].source_path).toBe("2026-q2-de-01/source.csv");
    expect(rows[1].source_path).toBe("2026-q3-de-01/newsource.csv");
    db.close();
  });

  it("allows the same site to have seeds from different sources in the same quarter", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const siteId = upsertSite(db, "example.de");

    upsertSourceSeed(db, siteId, "2026-q3-de-01/source-a.csv", seed({ sourceItemKey: "a-key" }));
    upsertSourceSeed(db, siteId, "2026-q3-de-01/source-b.csv", seed({ sourceItemKey: "b-key" }));

    const count = db
      .prepare("SELECT COUNT(*) c FROM site_source_seeds WHERE site_id = ?")
      .get(siteId) as { c: number };
    expect(count.c).toBe(2);
    db.close();
  });
});

describe("insertSkippedSeed", () => {
  it("inserts a skipped seed with a reason", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS skipped_source_seeds (
        source_path TEXT NOT NULL,
        item_key    TEXT NOT NULL,
        business_name TEXT,
        raw_url     TEXT,
        reason      TEXT NOT NULL,
        PRIMARY KEY (source_path, item_key)
      );
    `);
    insertSkippedSeed(db, "batch/source.csv", seed(), "no_url");
    const rows = db.prepare("SELECT * FROM skipped_source_seeds").all();
    expect(rows).toHaveLength(1);
    db.close();
  });
});
