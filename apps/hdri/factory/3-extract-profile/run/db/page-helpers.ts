/*
<MODULE_CONTRACT>
<purpose>Shared page-DB helpers for CrawlGogol and FetchDetectedPagesGogol — URL normalisation, SHA-256 hashing, and upsert functions for page_contents, site_pages, and page_observations tables.</purpose>
<non-goals>
  <item>Do not open or close database connections — callers manage DB lifecycle.</item>
  <item>Do not fetch pages or perform HTTP requests.</item>
  <item>Do not write content files to disk.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from duplicated helpers in CrawlGogol and FetchDetectedPagesGogol.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

/**
 * Normalise a URL: strip hash, lowercase hostname, ensure pathname is "/".
 * Returns the original string if URL parsing fails.
 */
export const normalisePageUrl = (url: string): string => {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname === "") u.pathname = "/";
    return u.toString();
  } catch {
    return url;
  }
};

/** SHA-256 hex digest of a UTF-8 string. */
export const sha256Hex = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Insert a page_contents row if not already present (CAS by sha256).
 * No-op on conflict — content is immutable.
 */
export const upsertPageContent = (
  pagesDb: Database.Database,
  sha256: string,
  storagePath: string,
  byteSize: number,
): void => {
  pagesDb
    .prepare(
      `
    INSERT INTO page_contents (sha256, storage_path, byte_size)
    VALUES (?, ?, ?)
    ON CONFLICT(sha256) DO NOTHING
  `,
    )
    .run(sha256, storagePath, byteSize);
};

/**
 * Upsert a site_pages row and return its id.
 * When `source` is provided, the column is set; otherwise it uses the schema default.
 */
export const upsertSitePage = (
  pagesDb: Database.Database,
  siteId: number,
  urlNorm: string,
  urlSha256: string,
  source?: string,
): number => {
  if (source !== undefined) {
    pagesDb
      .prepare(
        `
      INSERT INTO site_pages (site_id, url_norm, url_sha256, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(site_id, url_sha256) DO UPDATE SET
        last_seen_at = unixepoch()
    `,
      )
      .run(siteId, urlNorm, urlSha256, source);
  } else {
    pagesDb
      .prepare(
        `
      INSERT INTO site_pages (site_id, url_norm, url_sha256)
      VALUES (?, ?, ?)
      ON CONFLICT(site_id, url_sha256) DO UPDATE SET
        last_seen_at = unixepoch()
    `,
      )
      .run(siteId, urlNorm, urlSha256);
  }

  const row = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number };
  return row.id;
};

/**
 * Get or create a site_pages row without updating last_seen_at if it already exists.
 * Used by CrawlGogol for homepage entries that should not trigger a seen-at bump
 * on every resume check.
 */
export const getOrCreateSitePage = (
  pagesDb: Database.Database,
  siteId: number,
  urlNorm: string,
  urlSha256: string,
): number => {
  const existing = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  pagesDb
    .prepare(
      `
    INSERT INTO site_pages (site_id, url_norm, url_sha256)
    VALUES (?, ?, ?)
  `,
    )
    .run(siteId, urlNorm, urlSha256);

  const row = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number };
  return row.id;
};

/**
 * Upsert a page_observations row for a given site_page.
 * On conflict, updates content_sha256, is_new_content, and observed_at.
 */
export const upsertPageObservation = (
  pagesDb: Database.Database,
  sitePageId: number,
  contentSha256: string,
  isNewContent: boolean,
  errorClass = "ok",
): void => {
  pagesDb
    .prepare(
      `
    INSERT INTO page_observations (site_page_id, content_sha256, is_new_content, error_class)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(site_page_id) DO UPDATE SET
      content_sha256 = excluded.content_sha256,
      is_new_content = excluded.is_new_content,
      error_class    = excluded.error_class,
      observed_at    = unixepoch()
  `,
    )
    .run(sitePageId, contentSha256, isNewContent ? 1 : 0, errorClass);
};
