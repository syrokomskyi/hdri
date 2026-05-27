/*
<MODULE_CONTRACT>
<purpose>Fetches internal pages detected during extraction and persists their content in CAS storage.</purpose>
<keywords>fetch, detected pages, impressum, datenschutz, AGB, BFSG, CAS, site_pages</keywords>
<responsibilities>
  <item>Read ext_* tables for the current batch to collect detected URLs (present=1, url IS NOT NULL).</item>
  <item>Deduplicate URLs across all ext_* tables (same page may be detected by multiple extractors).</item>
  <item>Fetch each detected URL via HTTPS with HTTP fallback on network-level failure.</item>
  <item>Store raw HTML on disk in CAS layout: data/content/{sha256[0:2]}/{sha256}.html.</item>
  <item>Upsert page_contents and page_observations in pages_YYYY.db.</item>
  <item>Upsert site_pages rows in pages_YYYY.db with source='detected'.</item>
  <item>Update ext_* tables with detected_page_sha256 linking to fetched content.</item>
  <item>Hardcoded rescan policy: error rows always re-fetched, OK rows never re-fetched.</item>
  <item>Write fetch-detected-pages-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch external registry or social media links — only internal pages.</item>
  <item>Do not perform any signal extraction — that is the responsibility of Extract gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="processOne">Per-URL fetch + CAS write + DB upsert logic.</entry>
  <entry key="FetchDetectedPagesGogol.run">Orchestrates the bounded-concurrency fetch loop and writes artifacts.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created FetchDetectedPagesGogol as Phase 3 to fetch internal pages detected during extraction.</item>
  <item>Phase B cleanup: remove fetchDetectedPages check (now always enabled).</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Move site_pages writes from registry.db to pages_YYYY.db; remove registryDb ATTACH.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix try/finally scope: move detectedUrls, uniqueUrls, and stats declarations outside the try block so db.close() runs safely and post-processing remains accessible.</item>
  <item>Fix idempotency: rescan policy referenced non-existent http_status column in page_observations, causing ALL detected pages to be re-fetched every run. Replaced with simple page_observations existence check.</item>
  <item>Fix idempotency: use original detected URL (not finalUrl after redirect) for site_pages upsert so existingSitePage check matches on subsequent runs, preventing duplicate site_pages rows.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import { stringify as csvStringify } from 'csv-stringify/sync';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { fetchPageContent } from '@org/business-crawler/fetch-page';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import {
  openPagesDb,
} from '../db/connection.js';
import {
  getContentDir, getContentFilePath, getContentRelativePath,
  getPagesDbPath,
} from '../paths.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetectedUrlRow = {
  content_sha256: string;
  url: string;
  table_name: string;
};

type FetchStat = {
  url: string;
  source_table: string;
  ok: boolean;
  httpStatus: number | null;
  isNewContent: boolean;
  errorCode: string | null;
  skipped?: boolean;
};

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

const normalisePageUrl = (url: string): string => {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname === '') u.pathname = '/';
    return u.toString();
  } catch {
    return url;
  }
};

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// DB write helpers
// ---------------------------------------------------------------------------

const upsertPageContent = (
  pagesDb: Database.Database,
  sha256: string,
  storagePath: string,
  byteSize: number,
): void => {
  pagesDb.prepare(`
    INSERT INTO page_contents (sha256, storage_path, byte_size)
    VALUES (?, ?, ?)
    ON CONFLICT(sha256) DO NOTHING
  `).run(sha256, storagePath, byteSize);
};

const upsertSitePage = (
  pagesDb: Database.Database,
  siteId: number,
  urlNorm: string,
  urlSha256: string,
  source: string,
): number => {
  pagesDb.prepare(`
    INSERT INTO site_pages (site_id, url_norm, url_sha256, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(site_id, url_sha256) DO UPDATE SET
      last_seen_at = unixepoch()
  `).run(siteId, urlNorm, urlSha256, source);

  const row = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number };
  return row.id;
};

const upsertPageObservation = (
  pagesDb: Database.Database,
  sitePageId: number,
  contentSha256: string,
  isNewContent: boolean,
): void => {
  pagesDb.prepare(`
    INSERT INTO page_observations (site_page_id, content_sha256, is_new_content)
    VALUES (?, ?, ?)
    ON CONFLICT(site_page_id) DO UPDATE SET
      content_sha256 = excluded.content_sha256,
      is_new_content = excluded.is_new_content,
      observed_at    = unixepoch()
  `).run(sitePageId, contentSha256, isNewContent ? 1 : 0);
};

const updateExtTableWithDetectedSha256 = (
  pagesDb: Database.Database,
  tableName: string,
  contentSha256: string,
  detectedPageSha256: string,
): void => {
  pagesDb.prepare(`
    UPDATE ${tableName}
    SET detected_page_sha256 = ?
    WHERE content_sha256 = ?
  `).run(detectedPageSha256, contentSha256);
};

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class FetchDetectedPagesGogol extends Gogol {
  override readonly id = 'fetch-detected-pages';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;

    // Derive year/half from sourceToken (B.1 cleanup)
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;

    // ── 1. Collect detected URLs from ext_* tables ─────────────────────────────
    const pagesDbPath = getPagesDbPath(year, half);
    const pagesDb = openPagesDb(pagesDbPath);

    const detectedUrls: DetectedUrlRow[] = [];
    let uniqueUrls: DetectedUrlRow[] = [];
    const stats: FetchStat[] = [];

    try {
      // Tables that have url field and represent internal pages we want to fetch
      const fetchableTables = [
        'ext_impressum',
        'ext_datenschutz',
        'ext_bfsg_page',
        'ext_agb_page',
        'ext_widerruf_page',
        'ext_versand_page',
        'ext_team_page',
      ];

      for (const table of fetchableTables) {
        const rows = pagesDb
          .prepare<[]>(`
            SELECT content_sha256, url FROM ${table}
            WHERE present = 1 AND url IS NOT NULL
          `)
          .all() as { content_sha256: string; url: string }[];

        for (const row of rows) {
          detectedUrls.push({
            content_sha256: row.content_sha256,
            url: row.url!,
            table_name: table,
          });
        }
      }

      console.log(`[fetch-detected-pages] ${detectedUrls.length} detected URL(s) from ${fetchableTables.length} table(s)`);

      // ── 2. Deduplicate URLs ───────────────────────────────────────────────────
      const urlMap = new Map<string, DetectedUrlRow>();
      for (const item of detectedUrls) {
        const urlNorm = normalisePageUrl(item.url);
        // Keep the first occurrence (prioritize impressum, datenschutz, etc.)
        if (!urlMap.has(urlNorm)) {
          urlMap.set(urlNorm, item);
        }
      }

      uniqueUrls = Array.from(urlMap.values());
      console.log(`[fetch-detected-pages] ${uniqueUrls.length} unique URL(s) after deduplication`);

      if (uniqueUrls.length === 0) {
        console.log(`[fetch-detected-pages] No URLs to fetch`);
        return;
      }

      // ── 3. Fetch loop ────────────────────────────────────────────────────────
      await fs.mkdir(getContentDir(), { recursive: true });

      let completed = 0;
      const okCountShared = new Int32Array(new SharedArrayBuffer(4));
      const logEvery = Math.max(1, Math.min(5, Math.ceil(uniqueUrls.length / 4)));

      const processOne = async (item: DetectedUrlRow): Promise<void> => {
        const urlNorm = normalisePageUrl(item.url);
        const urlSha256 = sha256Hex(urlNorm);

        // Determine site_id from homepage observation (join via content_sha256)
        const homepageObs = pagesDb
          .prepare<[string], { site_page_id: number }>(`
            SELECT site_page_id FROM page_observations WHERE content_sha256 = ? LIMIT 1
          `)
          .get(item.content_sha256) as { site_page_id: number } | undefined;

        if (!homepageObs) {
          stats.push({
            url: item.url,
            source_table: item.table_name,
            ok: false,
            httpStatus: null,
            isNewContent: false,
            errorCode: 'NO_HOMEPAGE_OBS',
          });
          completed++;
          return;
        }

        // Get site_id from site_pages
        const sitePage = pagesDb
          .prepare<[number], { site_id: number }>(
            `SELECT site_id FROM site_pages WHERE id = ?`,
          )
          .get(homepageObs.site_page_id) as { site_id: number } | undefined;

        if (!sitePage) {
          stats.push({
            url: item.url,
            source_table: item.table_name,
            ok: false,
            httpStatus: null,
            isNewContent: false,
            errorCode: 'NO_SITE_PAGE',
          });
          completed++;
          return;
        }

        // Check if already fetched and apply hardcoded rescan policy (B.2)
        // Policy: error rows always re-fetched, OK rows never re-fetched (skip)
        const existingSitePage = pagesDb
          .prepare<[number, string], { id: number }>(
            `SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`,
          )
          .get(sitePage.site_id, urlSha256);

        if (existingSitePage) {
          const hasObservation = pagesDb
            .prepare<[number], { 1: number }>(
              `SELECT 1 FROM page_observations WHERE site_page_id = ? LIMIT 1`,
            )
            .get(existingSitePage.id);

          if (hasObservation) {
            // Successfully fetched before — never re-fetch OK rows
            stats.push({
              url: item.url,
              source_table: item.table_name,
              ok: true,
              httpStatus: 200,
              isNewContent: false,
              errorCode: null,
              skipped: true,
            });
            completed++;
            return;
          }
          // No page_observation means previous fetch failed — re-fetch (error rows always re-fetched)
        }

        const result = await fetchPageContent(item.url, { timeoutMs: brief.timeoutMs });
        const fetched =
          result.ok
            ? result
            : (result.errorCode === 'SSL_ERROR' || result.errorCode === 'ENOTFOUND' || result.errorCode === 'ETIMEDOUT')
              ? await fetchPageContent(item.url.replace(/^https:/, 'http:'), { timeoutMs: brief.timeoutMs })
              : result;

        completed++;
        if (fetched.ok) Atomics.add(okCountShared, 0, 1);
        if (completed % logEvery === 0 || completed === uniqueUrls.length) {
          logProgress(this.id, completed, uniqueUrls.length, logEvery, true);
        }

        if (!fetched.ok || fetched.httpStatus === null || fetched.httpStatus >= 400) {
          stats.push({
            url: item.url,
            source_table: item.table_name,
            ok: false,
            httpStatus: fetched.ok ? fetched.httpStatus : null,
            isNewContent: false,
            errorCode: fetched.ok ? `HTTP_${fetched.httpStatus}` : (fetched as { errorCode: string }).errorCode,
          });
          return;
        }

        const sha256 = fetched.contentHash;
        const storagePath = getContentRelativePath(sha256);
        const contentFilePath = getContentFilePath(sha256);

        const isNewContent = !await fs.access(contentFilePath).then(() => true).catch(() => false);
        if (isNewContent) {
          await fs.mkdir(path.dirname(contentFilePath), { recursive: true });
          await fs.writeFile(contentFilePath, fetched.html, 'utf-8');
        }

        upsertPageContent(pagesDb, sha256, storagePath, fetched.contentLengthBytes);

        // Use the original detected URL for site_pages so rescan checks match on subsequent runs.
        const sitePageId = upsertSitePage(pagesDb, sitePage.site_id, urlNorm, urlSha256, 'detected');

        upsertPageObservation(pagesDb, sitePageId, sha256, isNewContent);

        // Update ext table with detected_page_sha256
        updateExtTableWithDetectedSha256(pagesDb, item.table_name, item.content_sha256, sha256);

        stats.push({
          url: item.url,
          source_table: item.table_name,
          ok: true,
          httpStatus: fetched.httpStatus,
          isNewContent,
          errorCode: null,
        });
      };

      // Bounded concurrency pool
      let idx = 0;
      const worker = async (): Promise<void> => {
        while (idx < uniqueUrls.length) {
          const item = uniqueUrls[idx++];
          if (item) await processOne(item);
        }
      };
      await Promise.all(Array.from({ length: Math.min(brief.concurrency, uniqueUrls.length || 1) }, worker));
    } finally {
      pagesDb.close();
    }

    // ── 4. Write artifacts ────────────────────────────────────────────────────
    const thisRunOk = stats.filter((s) => s.ok).length;
    const thisRunSkipped = stats.filter((s) => s.skipped).length;
    const thisRunFailed = stats.length - thisRunOk;

    console.log(
      `[fetch-detected-pages] Done. total=${stats.length} ok=${thisRunOk} skipped=${thisRunSkipped} failed=${thisRunFailed}`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);

    const report = {
      totalDetected: detectedUrls.length,
      totalUnique: uniqueUrls.length,
      fetched: thisRunOk,
      skipped: thisRunSkipped,
      failed: thisRunFailed,
    };

    await ctx.writeTextFile(path.join(outDir, 'fetch-detected-pages-report.json'), JSON.stringify(report, null, 2));

    await ctx.writeTextFile(
      path.join(outDir, 'fetch-detected-pages-report.md'),
      [
        `# Fetch Detected Pages — Report`,
        ``,
        `**Batch:** fetch-detected`,
        ``,
        markdownTable(
          [
            ['Metric', 'Value'],
            ['Detected URLs', String(detectedUrls.length)],
            ['Unique URLs', String(uniqueUrls.length)],
            ['Fetched', String(thisRunOk)],
            ['Skipped', String(thisRunSkipped)],
            ['Failed', String(thisRunFailed)],
          ],
          { align: ['l', 'r'] },
        ),
      ].join('\n'),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'detected-pages-fetched.csv'),
      csvStringify(
        [
          ['url', 'source_table', 'ok', 'http_status', 'is_new_content'],
          ...stats.map((s) => [
            s.url, s.source_table, s.ok ? 'true' : 'false', s.httpStatus, s.isNewContent ? 'true' : 'false',
          ]),
        ],
        { cast: { boolean: (v) => String(v) } },
      ),
    );
  }
}
