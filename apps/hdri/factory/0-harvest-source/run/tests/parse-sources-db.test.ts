import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { normaliseDomain, isStopDomain } from "@syrokomskyi/business-core/ids";
import {
  upsertSite,
  upsertSourceSeed,
  insertSkippedSeed,
  upsertFileStat,
} from "../gogols/parse-sources-db.js";
import type { SourceBusinessSeed } from "../source-records.js";
import type { SkipSummary, SourceFileStat } from "../gogols/parse-sources-types.js";

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
    const count = db.prepare("SELECT COUNT(*) c FROM sites WHERE domain = ?").get("example.de") as {
      c: number;
    };
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
      .prepare(
        "SELECT COUNT(*) c FROM site_source_seeds WHERE site_id = ? AND source_path = ? AND source_item_key = ?",
      )
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
      .prepare(
        "SELECT source_path, source_item_key FROM site_source_seeds WHERE site_id = ? ORDER BY source_path",
      )
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

const SKIPPED_DDL = `
  CREATE TABLE IF NOT EXISTS skipped_source_seeds (
    source_path TEXT NOT NULL,
    item_key    TEXT NOT NULL,
    business_name TEXT,
    raw_url     TEXT,
    reason      TEXT NOT NULL,
    PRIMARY KEY (source_path, item_key)
  );
`;

describe("insertSkippedSeed — all three skip reasons", () => {
  it("inserts a no_url skip when websiteUrl is null", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: null, sourceItemKey: "no-url-key" }),
      "no_url",
    );
    const row = db
      .prepare("SELECT * FROM skipped_source_seeds WHERE item_key = ?")
      .get("no-url-key") as {
      reason: string;
      raw_url: string | null;
    };
    expect(row.reason).toBe("no_url");
    expect(row.raw_url).toBeNull();
    db.close();
  });

  it("inserts a bad_url skip when normaliseDomain returns null", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    const badUrl = "https://192.168.1.1";
    expect(normaliseDomain(badUrl)).toBeNull();
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: badUrl, sourceItemKey: "bad-url-key" }),
      "bad_url",
    );
    const row = db
      .prepare("SELECT * FROM skipped_source_seeds WHERE item_key = ?")
      .get("bad-url-key") as {
      reason: string;
      raw_url: string | null;
    };
    expect(row.reason).toBe("bad_url");
    expect(row.raw_url).toBe(badUrl);
    db.close();
  });

  it("inserts a stop_domain skip when isStopDomain returns true", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    const stopUrl = "https://facebook.com/my-business";
    const domain = normaliseDomain(stopUrl);
    expect(domain).toBe("facebook.com");
    expect(isStopDomain(domain!)).toBe(true);
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: stopUrl, sourceItemKey: "stop-key" }),
      "stop_domain",
    );
    const row = db
      .prepare("SELECT * FROM skipped_source_seeds WHERE item_key = ?")
      .get("stop-key") as {
      reason: string;
      raw_url: string | null;
    };
    expect(row.reason).toBe("stop_domain");
    expect(row.raw_url).toBe(stopUrl);
    db.close();
  });

  it("does not duplicate a skipped seed with the same (source_path, item_key)", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    const s = seed({ websiteUrl: null, sourceItemKey: "dup-key" });
    insertSkippedSeed(db, "batch/source.csv", s, "no_url");
    insertSkippedSeed(db, "batch/source.csv", s, "no_url");
    const count = db
      .prepare("SELECT COUNT(*) c FROM skipped_source_seeds WHERE source_path = ? AND item_key = ?")
      .get("batch/source.csv", "dup-key") as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it("allows different skip reasons from the same source file (different item keys)", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: null, sourceItemKey: "k1" }),
      "no_url",
    );
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: "https://10.0.0.1", sourceItemKey: "k2" }),
      "bad_url",
    );
    insertSkippedSeed(
      db,
      "batch/source.csv",
      seed({ websiteUrl: "https://yelp.de", sourceItemKey: "k3" }),
      "stop_domain",
    );
    const rows = db
      .prepare("SELECT reason FROM skipped_source_seeds ORDER BY item_key")
      .all() as Array<{ reason: string }>;
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.reason)).toEqual(["no_url", "bad_url", "stop_domain"]);
    db.close();
  });

  it("allows the same item_key in different source files (different source_path)", () => {
    const db = new Database(":memory:");
    db.exec(SKIPPED_DDL);
    insertSkippedSeed(
      db,
      "batch-a/source.csv",
      seed({ websiteUrl: null, sourceItemKey: "same-key" }),
      "no_url",
    );
    insertSkippedSeed(
      db,
      "batch-b/source.csv",
      seed({ websiteUrl: null, sourceItemKey: "same-key" }),
      "no_url",
    );
    const count = db
      .prepare("SELECT COUNT(*) c FROM skipped_source_seeds WHERE item_key = ?")
      .get("same-key") as { c: number };
    expect(count.c).toBe(2);
    db.close();
  });
});

describe("upsertFileStat", () => {
  const FILE_STATS_DDL = `
    CREATE TABLE IF NOT EXISTS source_file_stats (
      source_path        TEXT NOT NULL PRIMARY KEY,
      items_parsed       INTEGER NOT NULL,
      items_registered   INTEGER NOT NULL,
      items_skipped      INTEGER NOT NULL,
      no_url_warnings    INTEGER NOT NULL,
      no_url             INTEGER NOT NULL,
      bad_url            INTEGER NOT NULL,
      stop_domain        INTEGER NOT NULL
    );
  `;

  const makeStat = (overrides: Partial<SourceFileStat> = {}): SourceFileStat => ({
    path: "batch/source.csv",
    type: "csv",
    itemsParsed: 100,
    itemsRegistered: 80,
    itemsSkipped: 20,
    noUrl: 10,
    badUrl: 5,
    stopDomain: 5,
    ...overrides,
  });

  const makeSkipSummary = (overrides: Partial<SkipSummary> = {}): SkipSummary => ({
    noUrl: 10,
    badUrl: 5,
    stopDomain: 5,
    ...overrides,
  });

  it("inserts a new file stat row", () => {
    const db = new Database(":memory:");
    db.exec(FILE_STATS_DDL);
    upsertFileStat(db, makeStat(), 3, makeSkipSummary());
    const row = db
      .prepare("SELECT * FROM source_file_stats WHERE source_path = ?")
      .get("batch/source.csv") as {
      items_parsed: number;
      items_registered: number;
      items_skipped: number;
      no_url_warnings: number;
      no_url: number;
      bad_url: number;
      stop_domain: number;
    };
    expect(row.items_parsed).toBe(100);
    expect(row.items_registered).toBe(80);
    expect(row.items_skipped).toBe(20);
    expect(row.no_url_warnings).toBe(3);
    expect(row.no_url).toBe(10);
    expect(row.bad_url).toBe(5);
    expect(row.stop_domain).toBe(5);
    db.close();
  });

  it("updates an existing file stat row on re-run (ON CONFLICT DO UPDATE)", () => {
    const db = new Database(":memory:");
    db.exec(FILE_STATS_DDL);
    upsertFileStat(db, makeStat(), 3, makeSkipSummary());
    upsertFileStat(
      db,
      makeStat({ itemsParsed: 200, itemsRegistered: 150, itemsSkipped: 50 }),
      5,
      makeSkipSummary({ noUrl: 30, badUrl: 10, stopDomain: 10 }),
    );
    const row = db
      .prepare("SELECT * FROM source_file_stats WHERE source_path = ?")
      .get("batch/source.csv") as {
      items_parsed: number;
      items_registered: number;
      items_skipped: number;
      no_url_warnings: number;
      no_url: number;
      bad_url: number;
      stop_domain: number;
    };
    expect(row.items_parsed).toBe(200);
    expect(row.items_registered).toBe(150);
    expect(row.items_skipped).toBe(50);
    expect(row.no_url_warnings).toBe(5);
    expect(row.no_url).toBe(30);
    expect(row.bad_url).toBe(10);
    expect(row.stop_domain).toBe(10);
    db.close();
  });

  it("does not create duplicate rows for the same source_path", () => {
    const db = new Database(":memory:");
    db.exec(FILE_STATS_DDL);
    upsertFileStat(db, makeStat(), 3, makeSkipSummary());
    upsertFileStat(db, makeStat(), 3, makeSkipSummary());
    const count = db
      .prepare("SELECT COUNT(*) c FROM source_file_stats WHERE source_path = ?")
      .get("batch/source.csv") as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });
});

describe("full parse-sources flow simulation — validation chain before upsertSite", () => {
  it("simulates the ParseSourcesGogol validation chain: no_url → bad_url → stop_domain → upsertSite", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS skipped_source_seeds (
        source_path TEXT NOT NULL,
        item_key    TEXT NOT NULL,
        business_name TEXT,
        raw_url     TEXT,
        reason      TEXT NOT NULL,
        PRIMARY KEY (source_path, item_key)
      );
      CREATE TABLE IF NOT EXISTS source_file_stats (
        source_path        TEXT NOT NULL PRIMARY KEY,
        items_parsed       INTEGER NOT NULL,
        items_registered   INTEGER NOT NULL,
        items_skipped      INTEGER NOT NULL,
        no_url_warnings    INTEGER NOT NULL,
        no_url             INTEGER NOT NULL,
        bad_url            INTEGER NOT NULL,
        stop_domain        INTEGER NOT NULL
      );
    `);

    const sourcePath = "2026-q3-de-01/source.csv";
    const items: SourceBusinessSeed[] = [
      seed({ sourceItemKey: "no-url", websiteUrl: null }),
      seed({ sourceItemKey: "bad-url", websiteUrl: "not a url" }),
      seed({ sourceItemKey: "stop", websiteUrl: "https://facebook.com/my-page" }),
      seed({ sourceItemKey: "good-1", websiteUrl: "https://www.example.de" }),
      seed({ sourceItemKey: "good-2", websiteUrl: "http://test.de" }),
      seed({ sourceItemKey: "good-1-dup", websiteUrl: "https://example.de" }),
    ];

    let registered = 0;
    let skipped = 0;
    const skipSummary = { noUrl: 0, badUrl: 0, stopDomain: 0 };

    db.transaction(() => {
      for (const item of items) {
        if (!item.websiteUrl) {
          insertSkippedSeed(db, sourcePath, item, "no_url");
          skipSummary.noUrl++;
          skipped++;
          continue;
        }
        const domain = normaliseDomain(item.websiteUrl);
        if (!domain) {
          insertSkippedSeed(db, sourcePath, item, "bad_url");
          skipSummary.badUrl++;
          skipped++;
          continue;
        }
        if (isStopDomain(domain)) {
          insertSkippedSeed(db, sourcePath, item, "stop_domain");
          skipSummary.stopDomain++;
          skipped++;
          continue;
        }
        const siteId = upsertSite(db, domain);
        upsertSourceSeed(db, siteId, sourcePath, item);
        registered++;
      }
    })();

    // 3 skipped (no_url, bad_url, stop_domain), 3 registered (good-1, good-2, good-1-dup)
    expect(registered).toBe(3);
    expect(skipped).toBe(3);
    expect(skipSummary).toEqual({ noUrl: 1, badUrl: 1, stopDomain: 1 });

    // good-1 and good-1-dup resolve to the same domain "example.de" → same site_id
    const sites = db.prepare("SELECT domain FROM sites ORDER BY domain").all() as Array<{
      domain: string;
    }>;
    expect(sites.map((s) => s.domain)).toEqual(["example.de", "test.de"]);

    // 3 skipped seeds with 3 different reasons
    const skippedRows = db
      .prepare("SELECT reason FROM skipped_source_seeds ORDER BY item_key")
      .all() as Array<{ reason: string }>;
    expect(skippedRows).toHaveLength(3);
    expect(skippedRows.map((r) => r.reason)).toEqual(["bad_url", "no_url", "stop_domain"]);

    // 3 source seeds (one per registered item, including the duplicate domain)
    const seedCount = db.prepare("SELECT COUNT(*) c FROM site_source_seeds").get() as { c: number };
    expect(seedCount.c).toBe(3);

    db.close();
  });
});
