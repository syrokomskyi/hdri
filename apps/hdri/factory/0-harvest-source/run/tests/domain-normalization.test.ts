import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { normaliseDomain, isStopDomain } from "@syrokomskyi/business-core/ids";
import { upsertSite } from "../gogols/parse-sources-db.js";

/**
 * Tests that domain normalization + upsertSite work together to deduplicate
 * sites correctly. The pipeline calls normaliseDomain(item.websiteUrl) BEFORE
 * upsertSite(db, domain), so the same site entered via different URL forms
 * must resolve to the same site_id.
 *
 * normaliseDomain rules (from domain-normalizer.ts):
 *  1. Strip whitespace
 *  2. Prepend "https://" if no scheme
 *  3. Parse URL → hostname
 *  4. Lowercase
 *  5. Strip leading "www."
 *  6. Strip trailing dots
 *  7. Reject bare labels (no dot) and IP addresses
 */

describe("normaliseDomain → upsertSite integration", () => {
  const getSiteId = (db: Database.Database, domain: string): number =>
    (db.prepare("SELECT id FROM sites WHERE domain = ?").get(domain) as { id: number }).id;

  const expectSameSite = (db: Database.Database, urls: string[], expectedDomain: string) => {
    const ids = new Set<number>();
    for (const url of urls) {
      const domain = normaliseDomain(url);
      expect(domain, `normaliseDomain("${url}")`).toBe(expectedDomain);
      ids.add(upsertSite(db, domain!));
    }
    expect(ids.size).toBe(1);
    expect(getSiteId(db, expectedDomain)).toBe([...ids][0]);
  };

  it("www.example.de and example.de resolve to the same site_id", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    expectSameSite(db, ["https://www.example.de", "http://example.de", "www.example.de"], "example.de");
    db.close();
  });

  it("HTTPS://Example.DE and example.de resolve to the same site_id (case-insensitive)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    expectSameSite(db, ["HTTPS://Example.DE/path", "https://EXAMPLE.DE", "Example.DE"], "example.de");
    db.close();
  });

  it("example.de. (trailing dot) and example.de resolve to the same site_id", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    expectSameSite(db, ["https://example.de.", "https://example.de"], "example.de");
    db.close();
  });

  it("https://example.de/path?q=1 and https://example.de/ resolve to the same site_id (path/query ignored)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    expectSameSite(
      db,
      ["https://example.de/path?q=1", "https://example.de/", "https://example.de/deep/nested/path"],
      "example.de",
    );
    db.close();
  });

  it("subdomain.example.de and example.de resolve to DIFFERENT site_ids (subdomain NOT stripped)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const d1 = normaliseDomain("https://subdomain.example.de");
    const d2 = normaliseDomain("https://example.de");
    expect(d1).toBe("subdomain.example.de");
    expect(d2).toBe("example.de");
    const id1 = upsertSite(db, d1!);
    const id2 = upsertSite(db, d2!);
    expect(id1).not.toBe(id2);
    db.close();
  });

  it("https://example.de:443 and https://example.de resolve to the same site_id (port stripped by URL hostname)", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const d1 = normaliseDomain("https://example.de:443");
    const d2 = normaliseDomain("https://example.de");
    expect(d1).toBe("example.de");
    expect(d2).toBe("example.de");
    expect(upsertSite(db, d1!)).toBe(upsertSite(db, d2!));
    db.close();
  });

  it("IP address returns null from normaliseDomain (bad_url skip, not a site)", () => {
    expect(normaliseDomain("https://192.168.1.1")).toBeNull();
    expect(normaliseDomain("https://93.184.216.34")).toBeNull();
    expect(normaliseDomain("10.0.0.1")).toBeNull();
  });

  it("localhost returns null from normaliseDomain (no dot = bare label)", () => {
    expect(normaliseDomain("http://localhost")).toBeNull();
    expect(normaliseDomain("localhost")).toBeNull();
    expect(normaliseDomain("localhost:3000")).toBeNull();
  });

  it("empty string and whitespace return null from normaliseDomain", () => {
    expect(normaliseDomain("")).toBeNull();
    expect(normaliseDomain("   ")).toBeNull();
    expect(normaliseDomain("\t\n")).toBeNull();
  });

  it("garbage that cannot be parsed as URL returns null", () => {
    expect(normaliseDomain("not a url at all")).toBeNull();
    expect(normaliseDomain("://no-scheme")).toBeNull();
  });

  it("does not create a site in DB when normaliseDomain returns null", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const domain = normaliseDomain("https://192.168.1.1");
    expect(domain).toBeNull();
    const count = db.prepare("SELECT COUNT(*) c FROM sites").get() as { c: number };
    expect(count.c).toBe(0);
    db.close();
  });

  it("multiple different domains get different site_ids", () => {
    const db = new Database(":memory:");
    migrateCore(db);
    const domains = ["alpha.de", "beta.de", "gamma.de"];
    const ids = domains.map((d) => upsertSite(db, d));
    expect(new Set(ids).size).toBe(3);
    db.close();
  });

  it("www prefix is stripped only once (www.www.example.de → www.example.de, not example.de)", () => {
    const d = normaliseDomain("https://www.www.example.de");
    expect(d).toBe("www.example.de");
  });
});

describe("isStopDomain", () => {
  it("returns true for exact stop domain match", () => {
    expect(isStopDomain("facebook.com")).toBe(true);
    expect(isStopDomain("google.de")).toBe(true);
    expect(isStopDomain("yelp.de")).toBe(true);
  });

  it("returns true for subdomain of a stop domain", () => {
    expect(isStopDomain("business.facebook.com")).toBe(true);
    expect(isStopDomain("maps.google.com")).toBe(true);
    expect(isStopDomain("sub.yelp.de")).toBe(true);
  });

  it("returns false for a legitimate business domain", () => {
    expect(isStopDomain("example.de")).toBe(false);
    expect(isStopDomain("my-business.com")).toBe(false);
    expect(isStopDomain("handwerk-mustermann.de")).toBe(false);
  });

  it("returns false for a domain that contains a stop domain as substring but is not a subdomain", () => {
    expect(isStopDomain("facebook.com.evil.com")).toBe(false);
    expect(isStopDomain("notfacebook.com")).toBe(false);
    expect(isStopDomain("google.com.my-business.de")).toBe(false);
  });

  it("returns false for a domain that starts like a stop domain but has a different TLD", () => {
    expect(isStopDomain("facebook.org")).toBe(false);
    expect(isStopDomain("google.net")).toBe(false);
  });
});
