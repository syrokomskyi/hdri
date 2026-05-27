/*
<MODULE_CONTRACT>
<purpose>Fetches homepages for live domains and persists raw HTML in CAS storage.</purpose>
<keywords>crawl, fetch, CAS, page_contents, page_observations, site_pages</keywords>
<responsibilities>
  <item>Read live domain list from liveness.db (or all domains from registry.db when liveOnly=false).</item>
  <item>Fetch each homepage via HTTPS with HTTP fallback on network-level failure.</item>
  <item>Store raw HTML on disk in CAS layout: data/content/{sha256[0:2]}/{sha256}.html.</item>
  <item>Upsert page_contents and page_observations in pages_YYYY.db.</item>
  <item>Upsert site_pages rows in pages_YYYY.db.</item>
  <item>Hardcoded rescan policy: error rows always re-fetched, OK rows never re-fetched.</item>
  <item>Write crawl-report.json and crawl-report.md artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not perform any signal extraction here — that is the responsibility of Extract gogols.</item>
  <item>Do not query or write ext_* tables.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="processOne">Per-domain fetch + CAS write + DB upsert logic.</entry>
  <entry key="CrawlGogol.run">Orchestrates the bounded-concurrency crawl loop and writes artifacts.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created CrawlGogol as the pure-crawl replacement for the former CrawlAndExtractGogol.</item>
  <item>Renamed gogol id from 'crawl' to 'crawl-pages' to avoid collision with the 'crawl' phase id in phase-registry.ts.</item>
  <item>Fix HTTP fallback: fallback to HTTP on network-level failures (SSL_ERROR, ENOTFOUND, ETIMEDOUT) instead of keeping HTTPS result.</item>
  <item>Fix restart/continuation: filter already-observed pages BEFORE processing loop (like 2-check-liveness), then load full stats from database at end.</item>
  <item>Fix fetched counter race condition: use Atomics.add/Atomics.load with SharedArrayBuffer for thread-safe counter instead of stats.filter in concurrent workers.</item>
  <item>Fix cross-database query: attach registry.db to pages_YYYY.db to access site_pages and sites tables in the final report query.</item>
  <item>Fix column reference error: remove http_status from report query since page_contents table doesn't store this column.</item>
  <item>Fix column name mismatch: schema has error_class (not error_code), and success is 'ok' (not null) because the column is TEXT NOT NULL DEFAULT 'ok'.</item>
  <item>Fix resume filter mismatch: query site_ids directly from site_pages+page_observations join instead of computing URL hashes, to handle HTTP fallback and redirects correctly.</item>
  <item>Fix first-run error: wrap page_observations query in try-catch to gracefully handle missing table on initial pipeline run, instead of pre-checking which had race conditions.</item>
  <item>Phase B.2: Hardcoded rescan policy - OK rows never re-fetched, error rows always re-fetched.</item>
  <item>Remove livenessBatchId filter; query all live sites without batch filter.</item>
  <item>Move site_pages writes from registry.db to pages_YYYY.db; site-profile no longer writes to upstream registry.db.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix idempotency: restrict resume filter to homepage source only (sp.source = 'homepage') so detected pages do not incorrectly mask failed homepages.</item>
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
  openPagesDb, openReadOnlyDb,
} from '../db/connection.js';
import {
  getContentDir, getContentFilePath, getContentRelativePath,
  getPagesDbPath,
} from '../paths.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SiteRow = { id: number; domain: string };

type CrawlStat = {
  domain: string;
  ok: boolean;
  httpStatus: number | null;
  isNewContent: boolean;
  errorCode: string | null;
  /** True if domain was skipped due to hardcoded rescan policy (OK rows never re-fetched). */
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
): number => {
  pagesDb.prepare(`
    INSERT INTO site_pages (site_id, url_norm, url_sha256)
    VALUES (?, ?, ?)
    ON CONFLICT(site_id, url_sha256) DO UPDATE SET
      last_seen_at = unixepoch()
  `).run(siteId, urlNorm, urlSha256);

  const row = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number };
  return row.id;
};

const getOrCreateSitePage = (
  pagesDb: Database.Database,
  siteId: number,
  urlNorm: string,
  urlSha256: string,
): number => {
  // Try to get existing without updating
  const existing = pagesDb
    .prepare<[number, string]>(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
    .get(siteId, urlSha256) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  // Create new row without upsert (won't update if exists)
  pagesDb.prepare(`
    INSERT INTO site_pages (site_id, url_norm, url_sha256)
    VALUES (?, ?, ?)
  `).run(siteId, urlNorm, urlSha256);

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

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class CrawlGogol extends Gogol {
  override readonly id = 'crawl-pages';

  override async run(ctx: PipelineContext): Promise<void> {
    const { resolvedRegistryDbPath, resolvedLivenessDbPath, brief } = ctx.state;

    // Derive year/half from sourceToken (B.1 cleanup)
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;

    // ── 1. Build domain list ──────────────────────────────────────────────
    const livenessDb = openReadOnlyDb(resolvedLivenessDbPath);

    let sites: SiteRow[];

    // B.2: liveOnly is hardcoded to true always
    const liveOnly = true;
    sites = livenessDb.prepare(`
      SELECT DISTINCT site_id AS id, domain
      FROM liveness_checks
      WHERE is_live = 1
      ORDER BY site_id
    `).all() as SiteRow[];

    livenessDb.close();

    if (brief.maxDomains >= 0) sites = sites.slice(0, brief.maxDomains);

    console.log(
      `[crawl] ${sites.length} domain(s) — liveOnly=${liveOnly} concurrency=${brief.concurrency}`,
    );

    // ── 2. Open pages DB ──────────────────────────────────────────────────
    const pagesDbPath = getPagesDbPath(year, half);
    const pagesDb = openPagesDb(pagesDbPath);
    await fs.mkdir(getContentDir(), { recursive: true });

    // ── 2b. Skip already-observed homepages for current batch (resume support) ──
    const observedSiteIds = new Set<number>();

    try {
      const observed = pagesDb
        .prepare<[], { site_id: number }>(`
          SELECT DISTINCT sp.site_id
          FROM page_observations po
          JOIN site_pages sp ON sp.id = po.site_page_id
          WHERE sp.source = 'homepage'
        `)
        .all() as { site_id: number }[];

      for (const row of observed) {
        observedSiteIds.add(row.site_id);
      }
    } catch (e) {
      // Table doesn't exist on first run - proceed with empty set
      const err = e as { message?: string };
      if (err.message?.includes('no such table')) {
        console.log('[crawl] page_observations table not found (first run), proceeding with all sites');
      } else {
        throw e;
      }
    }
    
    const originalCount = sites.length;

    // Filter out sites that already have any page observed in current batch
    sites = sites.filter((site) => !observedSiteIds.has(site.id));

    const skippedCurrentBatch = originalCount - sites.length;

    console.log(
      `[crawl] ${originalCount} domain(s) total — ${skippedCurrentBatch} already observed in current batch, ${sites.length} remaining`,
    );

    if (sites.length === 0) {
      console.log(`[crawl] All pages already observed. Nothing to do.`);
      pagesDb.close();
      return;
    }

    // ── 3. Crawl loop ─────────────────────────────────────────────────────
    const stats: CrawlStat[] = [];
    let completed = 0;
    const okCountShared = new Int32Array(new SharedArrayBuffer(4));
    const logEvery = Math.max(1, Math.min(5, Math.ceil(sites.length / 4)));

    const processOne = async (site: SiteRow): Promise<void> => {
      const url = `https://${site.domain}`;
      const urlNorm = normalisePageUrl(url);
      const urlSha256 = sha256Hex(urlNorm);

      // Get existing site_page_id if it exists
      const existingSitePage = pagesDb
        .prepare<[number, string], { id: number }>(
          `SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`,
        )
        .get(site.id, urlSha256) as { id: number } | undefined;

      let sitePageId: number;

      // If site_page exists, check for previous batch observation to possibly skip (rescanPolicy)
      if (existingSitePage) {
        sitePageId = existingSitePage.id;
        const existing = pagesDb
          .prepare<[number], { content_sha256: string; observed_at: number; error_class: string }>(
            `SELECT content_sha256, observed_at, error_class FROM page_observations WHERE site_page_id = ? ORDER BY observed_at DESC LIMIT 1`,
          )
          .get(sitePageId) as { content_sha256: string; observed_at: number; error_class: string } | undefined;

        if (existing) {
          // B.2: Hardcoded rescan policy - OK rows never re-fetched, error rows always re-fetched
          if (existing.error_class === 'ok') {
            // Previous observation was successful - never re-fetch OK rows
            stats.push({ domain: site.domain, ok: true, httpStatus: 200, isNewContent: false, errorCode: null, skipped: true });
            return;
          }
          // Previous observation had an error - always re-fetch error rows
          // (proceed to re-fetch below)
        }
      } else {
        // site_page doesn't exist yet - create it
        sitePageId = getOrCreateSitePage(pagesDb, site.id, urlNorm, urlSha256);
      }

      const result = await fetchPageContent(url, { timeoutMs: brief.timeoutMs });
      const fetched =
        result.ok
          ? result
          : (result.errorCode === 'SSL_ERROR' || result.errorCode === 'ENOTFOUND' || result.errorCode === 'ETIMEDOUT')
            ? await fetchPageContent(`http://${site.domain}`, { timeoutMs: brief.timeoutMs })
            : result;

      completed++;
      if (fetched.ok) Atomics.add(okCountShared, 0, 1);
      if (completed % logEvery === 0 || completed === sites.length) {
        logProgress(this.id, completed, sites.length, logEvery, true);
      }

      if (!fetched.ok || fetched.httpStatus === null || fetched.httpStatus >= 400) {
        stats.push({
          domain: site.domain,
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

      const finalUrlNorm = normalisePageUrl(fetched.finalUrl);
      const finalUrlSha256 = sha256Hex(finalUrlNorm);
      if (finalUrlSha256 !== urlSha256) {
        upsertSitePage(pagesDb, site.id, finalUrlNorm, finalUrlSha256);
      }

      upsertPageObservation(pagesDb, sitePageId, sha256, isNewContent);

      stats.push({
        domain: site.domain,
        ok: true,
        httpStatus: fetched.httpStatus,
        isNewContent,
        errorCode: null,
      });
    };

    // Bounded concurrency pool
    let idx = 0;
    const worker = async (): Promise<void> => {
      while (idx < sites.length) {
        const site = sites[idx++];
        if (site) await processOne(site);
      }
    };
    await Promise.all(Array.from({ length: Math.min(brief.concurrency, sites.length || 1) }, worker));

    pagesDb.close();

    // ── 4. Load full batch stats from database (includes resumed sites) ─────
    const reportDb = openPagesDb(pagesDbPath);

    // Attach registry.db to access sites table (site_pages now lives in pages_YYYY.db)
    reportDb.exec(`ATTACH DATABASE '${resolvedRegistryDbPath.replace(/'/g, "''")}' AS registry`);

    const totalObserved = (reportDb.prepare(
      `SELECT COUNT(*) AS n FROM page_observations`,
    ).get() as { n: number }).n;

    const newContentCount = (reportDb.prepare(
      `SELECT COUNT(*) AS n FROM page_observations WHERE is_new_content = 1`,
    ).get() as { n: number }).n;

    // Load all observations for CSV (full batch from database)
    const allObservations = reportDb.prepare(
      `SELECT s.domain, po.is_new_content, po.observed_at
       FROM page_observations po
       JOIN site_pages sp ON po.site_page_id = sp.id
       JOIN registry.sites s ON sp.site_id = s.id
       ORDER BY s.id`,
    ).all() as {
      domain: string; is_new_content: number; observed_at: number;
    }[];

    reportDb.exec('DETACH DATABASE registry');
    reportDb.close();

    // Stats from this run only (for incremental reporting)
    const thisRunOk = stats.filter((s) => s.ok).length;
    const thisRunSkipped = stats.filter((s) => s.skipped).length;
    const thisRunFailed = stats.length - thisRunOk;

    console.log(
      `[crawl] Done. total=${totalObserved} newContent=${newContentCount} (this run: ${stats.length} sites, ok=${thisRunOk} skipped=${thisRunSkipped} failed=${thisRunFailed})`,
    );

    // ── 5. Write artifacts ────────────────────────────────────────────────
    const outDir = ctx.getGogolOutputDir(this.id);

    const report = {
      total: totalObserved,
      newContent: newContentCount,
      _meta: {
        sitesInThisRun: stats.length,
        resumed: skippedCurrentBatch > 0,
        previouslyObserved: skippedCurrentBatch,
      },
    };

    await ctx.writeTextFile(path.join(outDir, 'crawl-report.json'), JSON.stringify(report, null, 2));

    await ctx.writeTextFile(
      path.join(outDir, 'crawl-report.md'),
      [
        `# Crawl — Report`,
        ``,
        `**Batch:** crawl`,
        ``,
        markdownTable(
          [
            ['Metric', 'Value'],
            ['Pages observed', String(totalObserved)],
            ['New content (cache miss)', String(newContentCount)],
          ],
          { align: ['l', 'r'] },
        ),
      ].join('\n'),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'pages-crawled.csv'),
      csvStringify(
        [
          ['domain', 'is_new_content', 'observed_at'],
          ...allObservations.map((s) => [
            s.domain, s.is_new_content ? 'true' : 'false', new Date(s.observed_at * 1000).toISOString(),
          ]),
        ],
        { cast: { boolean: (v) => String(v) } },
      ),
    );
  }
}

