/*
<MODULE_CONTRACT>
<purpose>Fetches internal pages detected during extraction and persists their content in CAS storage.</purpose>
<non-goals>
  <item>Do not fetch external registry or social media links — only internal pages.</item>
  <item>Do not perform any signal extraction — that is the responsibility of Extract gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created FetchDetectedPagesGogol as Phase 3 to fetch internal pages detected during extraction.</item>
  <item>Phase B cleanup: remove fetchDetectedPages check (now always enabled).</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Move site_pages writes from registry.db to pages_YYYY.db; remove registryDb ATTACH.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix try/finally scope: move detectedUrls, uniqueUrls, and stats declarations outside the try block so db.close() runs safely and post-processing remains accessible.</item>
  <item>Fix idempotency: rescan policy referenced non-existent http_status column in page_observations, causing ALL detected pages to be re-fetched every run. Replaced with simple page_observations existence check.</item>
  <item>Fix idempotency: use original detected URL (not finalUrl after redirect) for site_pages upsert so existingSitePage check matches on subsequent runs, preventing duplicate site_pages rows.</item>
  <item>Fix dedup fan-out: fetch each normalized URL once while updating every ext_* source row that detected it.</item>
  <item>Extract shared page-DB helpers (normalisePageUrl, sha256Hex, upsertPageContent, upsertSitePage, upsertPageObservation) to db/page-helpers.ts.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { stringify as csvStringify } from "csv-stringify/sync";
import path from "node:path";
import { markdownTable } from "markdown-table";
import { fetchPageContent } from "@syrokomskyi/business-crawler/fetch-page";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openPagesDb } from "../db/connection.js";
import {
  normalisePageUrl,
  sha256Hex,
  upsertPageContent,
  upsertSitePage,
  upsertPageObservation,
} from "../db/page-helpers.js";
import {
  getContentDir,
  getContentFilePath,
  getContentRelativePath,
  getPagesDbPath,
} from "../paths.js";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetectedUrlRow = {
  content_sha256: string;
  url: string;
  table_name: string;
};

type DetectedUrlGroup = {
  url: string;
  url_norm: string;
  rows: DetectedUrlRow[];
};

type FetchStat = {
  url: string;
  source_table: string;
  ok: boolean;
  httpStatus: number | null;
  isNewContent: boolean;
  errorCode: string | null;
  skipped?: boolean;
  updatedRows: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sourceTablesLabel = (rows: DetectedUrlRow[]): string =>
  Array.from(new Set(rows.map((row) => row.table_name))).join(",");

const updateExtTableWithDetectedSha256 = (
  pagesDb: Database.Database,
  tableName: string,
  contentSha256: string,
  detectedPageSha256: string,
): void => {
  pagesDb
    .prepare(
      `
    UPDATE ${tableName}
    SET detected_page_sha256 = ?
    WHERE content_sha256 = ?
  `,
    )
    .run(detectedPageSha256, contentSha256);
};

const updateDetectedSources = (
  pagesDb: Database.Database,
  rows: DetectedUrlRow[],
  detectedPageSha256: string,
): number => {
  for (const row of rows) {
    updateExtTableWithDetectedSha256(
      pagesDb,
      row.table_name,
      row.content_sha256,
      detectedPageSha256,
    );
  }

  return rows.length;
};

// ---------------------------------------------------------------------------
// Gogol
// ---------------------------------------------------------------------------

export class FetchDetectedPagesGogol extends Gogol {
  override readonly id = "fetch-detected-pages";

  override async run(ctx: PipelineContext): Promise<void> {
    const { pagesDbName, brief } = ctx.state;

    // ── 1. Collect detected URLs from ext_* tables ─────────────────────────────
    const pagesDbPath = getPagesDbPath(pagesDbName);
    const pagesDb = openPagesDb(pagesDbPath);

    const detectedUrls: DetectedUrlRow[] = [];
    let uniqueUrls: DetectedUrlGroup[] = [];
    const stats: FetchStat[] = [];

    try {
      // Tables that have url field and represent internal pages we want to fetch
      const fetchableTables = [
        "ext_impressum",
        "ext_datenschutz",
        "ext_bfsg_page",
        "ext_agb_page",
        "ext_widerruf_page",
        "ext_versand_page",
        "ext_team_page",
      ];

      for (const table of fetchableTables) {
        const rows = pagesDb
          .prepare<[]>(
            `
            SELECT content_sha256, url FROM ${table}
            WHERE present = 1 AND url IS NOT NULL
          `,
          )
          .all() as { content_sha256: string; url: string }[];

        for (const row of rows) {
          detectedUrls.push({
            content_sha256: row.content_sha256,
            url: row.url!,
            table_name: table,
          });
        }
      }

      console.log(
        `[fetch-detected-pages] ${detectedUrls.length} detected URL(s) from ${fetchableTables.length} table(s)`,
      );

      // ── 2. Deduplicate URLs ───────────────────────────────────────────────────
      const urlMap = new Map<string, DetectedUrlGroup>();
      for (const item of detectedUrls) {
        const urlNorm = normalisePageUrl(item.url);
        const group = urlMap.get(urlNorm);
        if (group) {
          group.rows.push(item);
        } else {
          urlMap.set(urlNorm, {
            url: item.url,
            url_norm: urlNorm,
            rows: [item],
          });
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

      const processOne = async (item: DetectedUrlGroup): Promise<void> => {
        const urlNorm = item.url_norm;
        const urlSha256 = sha256Hex(urlNorm);
        const primaryRow = item.rows[0];

        if (!primaryRow) {
          completed++;
          return;
        }

        // Determine site_id from homepage observation (join via content_sha256)
        const homepageObs = pagesDb
          .prepare<[string], { site_page_id: number }>(
            `
            SELECT site_page_id FROM page_observations WHERE content_sha256 = ? LIMIT 1
          `,
          )
          .get(primaryRow.content_sha256) as { site_page_id: number } | undefined;

        if (!homepageObs) {
          stats.push({
            url: item.url,
            source_table: sourceTablesLabel(item.rows),
            ok: false,
            httpStatus: null,
            isNewContent: false,
            errorCode: "NO_HOMEPAGE_OBS",
            updatedRows: 0,
          });
          completed++;
          return;
        }

        // Get site_id from site_pages
        const sitePage = pagesDb
          .prepare<[number], { site_id: number }>(`SELECT site_id FROM site_pages WHERE id = ?`)
          .get(homepageObs.site_page_id) as { site_id: number } | undefined;

        if (!sitePage) {
          stats.push({
            url: item.url,
            source_table: sourceTablesLabel(item.rows),
            ok: false,
            httpStatus: null,
            isNewContent: false,
            errorCode: "NO_SITE_PAGE",
            updatedRows: 0,
          });
          completed++;
          return;
        }

        // Check if already fetched and apply hardcoded rescan policy (B.2)
        // Policy: error rows always re-fetched, OK rows never re-fetched (skip)
        const existingSitePage = pagesDb
          .prepare<
            [number, string],
            { id: number }
          >(`SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`)
          .get(sitePage.site_id, urlSha256);

        if (existingSitePage) {
          const hasObservation = pagesDb
            .prepare<
              [number],
              { content_sha256: string }
            >(`SELECT content_sha256 FROM page_observations WHERE site_page_id = ? LIMIT 1`)
            .get(existingSitePage.id);

          if (hasObservation) {
            const updatedRows = updateDetectedSources(
              pagesDb,
              item.rows,
              hasObservation.content_sha256,
            );
            // Successfully fetched before — never re-fetch OK rows
            stats.push({
              url: item.url,
              source_table: sourceTablesLabel(item.rows),
              ok: true,
              httpStatus: 200,
              isNewContent: false,
              errorCode: null,
              skipped: true,
              updatedRows,
            });
            completed++;
            return;
          }
          // No page_observation means previous fetch failed — re-fetch (error rows always re-fetched)
        }

        const result = await fetchPageContent(item.url, { timeoutMs: brief.timeoutMs });
        const fetched = result.ok
          ? result
          : result.errorCode === "SSL_ERROR" ||
              result.errorCode === "ENOTFOUND" ||
              result.errorCode === "ETIMEDOUT"
            ? await fetchPageContent(item.url.replace(/^https:/, "http:"), {
                timeoutMs: brief.timeoutMs,
              })
            : result;

        completed++;
        if (fetched.ok) Atomics.add(okCountShared, 0, 1);
        if (completed % logEvery === 0 || completed === uniqueUrls.length) {
          logProgress(this.id, completed, uniqueUrls.length, logEvery, true);
        }

        if (!fetched.ok || fetched.httpStatus === null || fetched.httpStatus >= 400) {
          stats.push({
            url: item.url,
            source_table: sourceTablesLabel(item.rows),
            ok: false,
            httpStatus: fetched.ok ? fetched.httpStatus : null,
            isNewContent: false,
            errorCode: fetched.ok
              ? `HTTP_${fetched.httpStatus}`
              : (fetched as { errorCode: string }).errorCode,
            updatedRows: 0,
          });
          return;
        }

        const sha256 = fetched.contentHash;
        const storagePath = getContentRelativePath(sha256);
        const contentFilePath = getContentFilePath(sha256);

        const isNewContent = !(await fs
          .access(contentFilePath)
          .then(() => true)
          .catch(() => false));
        if (isNewContent) {
          await fs.mkdir(path.dirname(contentFilePath), { recursive: true });
          await fs.writeFile(contentFilePath, fetched.html, "utf-8");
        }

        upsertPageContent(pagesDb, sha256, storagePath, fetched.contentLengthBytes);

        // Use the original detected URL for site_pages so rescan checks match on subsequent runs.
        const sitePageId = upsertSitePage(
          pagesDb,
          sitePage.site_id,
          urlNorm,
          urlSha256,
          "detected",
        );

        upsertPageObservation(pagesDb, sitePageId, sha256, isNewContent);

        const updatedRows = updateDetectedSources(pagesDb, item.rows, sha256);

        stats.push({
          url: item.url,
          source_table: sourceTablesLabel(item.rows),
          ok: true,
          httpStatus: fetched.httpStatus,
          isNewContent,
          errorCode: null,
          updatedRows,
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
      await Promise.all(
        Array.from({ length: Math.min(brief.concurrency, uniqueUrls.length || 1) }, worker),
      );
    } finally {
      pagesDb.close();
    }

    // ── 4. Write artifacts ────────────────────────────────────────────────────
    const thisRunOk = stats.filter((s) => s.ok).length;
    const thisRunSkipped = stats.filter((s) => s.skipped).length;
    const thisRunFailed = stats.length - thisRunOk;
    const updatedSourceRows = stats.reduce((sum, stat) => sum + stat.updatedRows, 0);

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
      updatedSourceRows,
    };

    await ctx.writeTextFile(
      path.join(outDir, "fetch-detected-pages-report.json"),
      JSON.stringify(report, null, 2),
    );

    await ctx.writeTextFile(
      path.join(outDir, "fetch-detected-pages-report.md"),
      [
        `# Fetch Detected Pages — Report`,
        ``,
        `**Batch:** fetch-detected`,
        ``,
        markdownTable(
          [
            ["Metric", "Value"],
            ["Detected URLs", String(detectedUrls.length)],
            ["Unique URLs", String(uniqueUrls.length)],
            ["Fetched", String(thisRunOk)],
            ["Skipped", String(thisRunSkipped)],
            ["Failed", String(thisRunFailed)],
            ["Updated source rows", String(updatedSourceRows)],
          ],
          { align: ["l", "r"] },
        ),
      ].join("\n"),
    );

    await ctx.writeTextFile(
      path.join(outDir, "detected-pages-fetched.csv"),
      csvStringify(
        [
          ["url", "source_table", "ok", "http_status", "is_new_content", "updated_rows"],
          ...stats.map((s) => [
            s.url,
            s.source_table,
            s.ok ? "true" : "false",
            s.httpStatus,
            s.isNewContent ? "true" : "false",
            s.updatedRows,
          ]),
        ],
        { cast: { boolean: (v) => String(v) } },
      ),
    );
  }
}
