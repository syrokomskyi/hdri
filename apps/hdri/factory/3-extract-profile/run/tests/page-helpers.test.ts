import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migratePages } from "@syrokomskyi/business-core/migrate";
import {
  normalisePageUrl,
  sha256Hex,
  upsertPageContent,
  upsertSitePage,
  getOrCreateSitePage,
  upsertPageObservation,
} from "../db/page-helpers.js";

describe("page-helpers", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migratePages(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("normalisePageUrl", () => {
    it("strips hash and lowercases hostname", () => {
      const result = normalisePageUrl("https://Example.COM/path#section");
      expect(result).toBe("https://example.com/path");
    });

    it("ensures pathname is / when empty", () => {
      const result = normalisePageUrl("https://example.com");
      expect(result).toBe("https://example.com/");
    });

    it("returns original string on invalid URL", () => {
      const result = normalisePageUrl("not-a-url");
      expect(result).toBe("not-a-url");
    });
  });

  describe("sha256Hex", () => {
    it("returns a 64-character hex string", () => {
      const result = sha256Hex("test");
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same input", () => {
      expect(sha256Hex("test")).toBe(sha256Hex("test"));
    });
  });

  describe("upsertPageContent", () => {
    it("inserts a row and does nothing on conflict", () => {
      const sha = sha256Hex("content");
      upsertPageContent(db, sha, "/path/to/content", 100);
      const row = db
        .prepare("SELECT sha256, storage_path, byte_size FROM page_contents WHERE sha256 = ?")
        .get(sha) as { sha256: string; storage_path: string; byte_size: number };
      expect(row.storage_path).toBe("/path/to/content");
      expect(row.byte_size).toBe(100);

      // Second insert with different data — ON CONFLICT DO NOTHING
      upsertPageContent(db, sha, "/different/path", 200);
      const row2 = db
        .prepare("SELECT storage_path, byte_size FROM page_contents WHERE sha256 = ?")
        .get(sha) as { storage_path: string; byte_size: number };
      expect(row2.storage_path).toBe("/path/to/content");
      expect(row2.byte_size).toBe(100);
    });
  });

  describe("upsertSitePage", () => {
    it("inserts a new page and returns its id", () => {
      const urlNorm = "https://example.com/";
      const urlSha256 = sha256Hex(urlNorm);
      const id = upsertSitePage(db, 1, urlNorm, urlSha256);
      expect(id).toBeGreaterThan(0);
      const row = db.prepare("SELECT site_id, url_norm FROM site_pages WHERE id = ?").get(id) as {
        site_id: number;
        url_norm: string;
      };
      expect(row.site_id).toBe(1);
      expect(row.url_norm).toBe(urlNorm);
    });

    it("updates last_seen_at on conflict", () => {
      const urlNorm = "https://example.com/page";
      const urlSha256 = sha256Hex(urlNorm);
      const id1 = upsertSitePage(db, 1, urlNorm, urlSha256, "homepage");
      const id2 = upsertSitePage(db, 1, urlNorm, urlSha256, "about");
      expect(id2).toBe(id1);
      const count = db.prepare("SELECT COUNT(*) as c FROM site_pages WHERE id = ?").get(id1) as { c: number };
      expect(count.c).toBe(1);
    });
  });

  describe("getOrCreateSitePage", () => {
    it("returns existing id without creating a duplicate", () => {
      const urlNorm = "https://example.com/existing";
      const urlSha256 = sha256Hex(urlNorm);
      const id1 = upsertSitePage(db, 1, urlNorm, urlSha256);
      const id2 = getOrCreateSitePage(db, 1, urlNorm, urlSha256);
      expect(id2).toBe(id1);
      const count = db.prepare("SELECT COUNT(*) as c FROM site_pages WHERE site_id = 1 AND url_sha256 = ?").get(urlSha256) as { c: number };
      expect(count.c).toBe(1);
    });

    it("creates a new page if it does not exist", () => {
      const urlNorm = "https://example.com/new";
      const urlSha256 = sha256Hex(urlNorm);
      const id = getOrCreateSitePage(db, 1, urlNorm, urlSha256);
      expect(id).toBeGreaterThan(0);
    });
  });

  describe("upsertPageObservation", () => {
    it("inserts a new observation", () => {
      const sitePageId = upsertSitePage(db, 1, "https://example.com/", sha256Hex("https://example.com/"));
      const contentSha = sha256Hex("content1");
      upsertPageObservation(db, sitePageId, contentSha, true);
      const row = db
        .prepare("SELECT content_sha256, is_new_content FROM page_observations WHERE site_page_id = ?")
        .get(sitePageId) as { content_sha256: string; is_new_content: number };
      expect(row.content_sha256).toBe(contentSha);
      expect(row.is_new_content).toBe(1);
    });

    it("updates on conflict with new content hash", () => {
      const sitePageId = upsertSitePage(db, 1, "https://example.com/", sha256Hex("https://example.com/"));
      const contentSha1 = sha256Hex("content1");
      const contentSha2 = sha256Hex("content2");
      upsertPageObservation(db, sitePageId, contentSha1, true);
      upsertPageObservation(db, sitePageId, contentSha2, false);
      const row = db
        .prepare("SELECT content_sha256, is_new_content FROM page_observations WHERE site_page_id = ?")
        .get(sitePageId) as { content_sha256: string; is_new_content: number };
      expect(row.content_sha256).toBe(contentSha2);
      expect(row.is_new_content).toBe(0);
    });
  });
});
