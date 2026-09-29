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
  <item>Fix stage-seal arithmetic: acquire the durable lease up front and route every declared detected-page target through journal.begin/finish so skipped and unresolvable URLs reach a terminal state. Previously early returns (no primary row, NO_SITE_PAGE, already-fetched skip) never committed a terminal state, leaving declared targets non-terminal and making sealStage throw "Stage target arithmetic is incomplete".</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { stringify as csvStringify } from "csv-stringify/sync";
import path from "node:path";
import { markdownTable } from "markdown-table";
import { fetchPageContent } from "@syrokomskyi/business-crawler/fetch-page";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import {
  QuarterExecutionJournal,
  capsuleConfigSha256,
  commitAttempt,
  declareStageTargetSet,
  allocateLeaseEpoch,
  openExecutionDb,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  snapshotCapsuleDbArtifact,
  withLeaseHeartbeat,
  workKeyId,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
} from "@syrokomskyi/factory-core";
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
import { factoryRootDir } from "../config.js";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetectedUrlRow = {
  content_sha256: string;
  url: string;
  table_name: string;
  asset_id: string;
  page_observation_id: number;
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

type DetectedPageEvidence = {
  schemaVersion: 1;
  stage: "detected-page-capture";
  siteId: number;
  provisionalAssetId: string;
  url: string;
  result:
    | {
        ok: true;
        httpStatus: number;
        finalUrl: string;
        contentHash: string;
        contentLengthBytes: number;
        isNewContent: boolean;
      }
    | { ok: false; httpStatus: number | null; errorCode: string; errorMsg: string | null };
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
  assetId: string,
  pageObservationId: number,
): void => {
  pagesDb
    .prepare(
      `
    UPDATE ${tableName}
    SET detected_page_sha256 = ?
    WHERE content_sha256 = ? AND asset_id = ? AND page_observation_id = ?
  `,
    )
    .run(detectedPageSha256, contentSha256, assetId, pageObservationId);
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
      row.asset_id,
      row.page_observation_id,
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

    // RFC-0114 B4b: Connect to B1 durable execution authority
    const parsed = parseSourceToken(brief.sourceToken);
    const period = `${parsed.year}-q${parsed.quarter}` as HdriPeriod;
    const capsuleDir = quarterCapsuleDir(factoryRootDir, brief.deviceId, period, brief.capsuleId);
    const journal = new QuarterExecutionJournal(
      quarterExecutionEventsDir(factoryRootDir, brief.deviceId, period, brief.capsuleId),
      capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan),
    );
    await journal.initialize(mintAssetId(), new Date().toISOString());
    const configSha = capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan);
    const durableDb = openExecutionDb(capsuleDir);

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
            SELECT content_sha256, url, asset_id, page_observation_id FROM ${table}
            WHERE present = 1 AND url IS NOT NULL
          `,
          )
          .all() as {
          content_sha256: string;
          url: string;
          asset_id: string;
          page_observation_id: number;
        }[];

        for (const row of rows) {
          detectedUrls.push({
            content_sha256: row.content_sha256,
            url: row.url!,
            table_name: table,
            asset_id: row.asset_id,
            page_observation_id: row.page_observation_id,
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

      // RFC-0114 B4b: work key for one detected URL — an asset can own up to
      // DETECTED_URL_LIMIT pages, so the asset id alone is not a unique key.
      // The URL hash rides in instrumentVersion, the only free-form key field.
      const keyFor = (item: DetectedUrlGroup): WorkKey => ({
        period,
        capsuleId: brief.capsuleId,
        stageId: "detected-page-capture",
        provisionalAssetId: (item.rows[0]?.asset_id ?? "unknown") as WorkKey["provisionalAssetId"],
        instrumentVersion: `profile-v2:page:${sha256Hex(item.url_norm)}`,
      });

      // Resume: when this stage already declared a frozen target set (a prior
      // execution began but did not seal), constrain the work set to exactly
      // those work keys. Re-extraction can surface additional detected URLs,
      // but the frozen declaration is authoritative — re-deriving a different
      // set trips the target-set immutability guard and orphans terminal results.
      const priorDeclaredIds = new Set(
        (
          durableDb
            .prepare("SELECT work_key_id FROM stage_targets WHERE stage_id = ?")
            .all("detected-page-capture") as { work_key_id: string }[]
        ).map((row) => row.work_key_id),
      );
      if (priorDeclaredIds.size > 0) {
        const detectedCount = uniqueUrls.length;
        uniqueUrls = uniqueUrls.filter((item) => priorDeclaredIds.has(workKeyId(keyFor(item))));
        if (uniqueUrls.length !== priorDeclaredIds.size) {
          throw new Error(
            `[fetch-detected-pages] ${priorDeclaredIds.size - uniqueUrls.length} frozen target(s) are no longer detected; refusing to resume with a differing target set`,
          );
        }
        if (detectedCount !== uniqueUrls.length) {
          console.log(
            `[fetch-detected-pages] resume: constrained to ${uniqueUrls.length} frozen target(s) (${detectedCount - uniqueUrls.length} newly detected URL(s) out of scope)`,
          );
        }
      } else {
        // ── 2b. Enforce 20 detected URL limit per asset (RFC-0104) ──────────────
        const DETECTED_URL_LIMIT = 20;
        const assetUrlCount = new Map<string, number>();
        const limitedUrls: DetectedUrlGroup[] = [];
        const limitExcluded: DetectedUrlGroup[] = [];
        for (const item of uniqueUrls) {
          const assetId = item.rows[0]?.asset_id ?? "";
          const count = assetUrlCount.get(assetId) ?? 0;
          if (count >= DETECTED_URL_LIMIT) {
            limitExcluded.push(item);
            continue;
          }
          assetUrlCount.set(assetId, count + 1);
          limitedUrls.push(item);
        }
        if (limitExcluded.length > 0) {
          console.log(
            `[fetch-detected-pages] ${limitExcluded.length} URL(s) excluded (>${DETECTED_URL_LIMIT} per asset limit)`,
          );
        }
        uniqueUrls = limitedUrls;
      }

      if (uniqueUrls.length === 0) {
        console.log(`[fetch-detected-pages] No URLs to fetch`);
        return;
      }

      // RFC-0114 B4b: Declare stage targets for detected-page-capture
      const stageTargetKeys = uniqueUrls.map(keyFor);
      await journal.declareStageTargets({
        stageId: "detected-page-capture",
        keys: stageTargetKeys,
        eventId: mintAssetId(),
        now: new Date().toISOString(),
      });
      declareStageTargetSet(durableDb, {
        stageId: "detected-page-capture",
        deviceId: brief.deviceId,
        workKeyIds: stageTargetKeys.map((k) => workKeyId(k)),
        now: new Date().toISOString(),
      });

      // RFC-0114 B4b: Resume from terminal results — skip already-sealed detected pages
      const terminalUrls = uniqueUrls.filter((item) => !journal.isTerminal(keyFor(item)));
      const skippedTerminal = uniqueUrls.length - terminalUrls.length;
      if (skippedTerminal > 0) {
        console.log(
          `[fetch-detected-pages] ${skippedTerminal} terminal, ${terminalUrls.length} remaining`,
        );
      }
      uniqueUrls = terminalUrls;

      if (uniqueUrls.length === 0) {
        console.log(`[fetch-detected-pages] All detected pages already terminal`);
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

        // RFC-0114 B4b: Acquire the durable lease up front so EVERY declared
        // target reaches a terminal journal state. The stage seal counts
        // terminal work; early returns that skip begin/finish leave declared
        // targets non-terminal and break the seal arithmetic.
        const wk = keyFor(item);
        const wkId = workKeyId(wk);
        const measuredAt = new Date().toISOString();
        const startedAt = new Date();
        const leaseDurationMs = brief.timeoutMs * 2 + 60_000;
        const durableAttemptId = mintAssetId();
        const epoch = allocateLeaseEpoch(durableDb, wkId, durableAttemptId, measuredAt);
        const attempt = await journal.begin({
          key: wk,
          attemptId: mintAssetId(),
          leaseOwner: brief.deviceId,
          now: measuredAt,
          leaseExpiresAt: new Date(startedAt.getTime() + leaseDurationMs).toISOString(),
        });
        if (!attempt) {
          completed++;
          return;
        }

        let evidencePayload: DetectedPageEvidence;
        let fetchedOk = false;

        if (!primaryRow) {
          stats.push({
            url: item.url,
            source_table: sourceTablesLabel(item.rows),
            ok: false,
            httpStatus: null,
            isNewContent: false,
            errorCode: "NO_PRIMARY_ROW",
            updatedRows: 0,
          });
          evidencePayload = {
            schemaVersion: 1,
            stage: "detected-page-capture",
            siteId: 0,
            provisionalAssetId: wk.provisionalAssetId,
            url: item.url,
            result: {
              ok: false,
              httpStatus: null,
              errorCode: "NO_PRIMARY_ROW",
              errorMsg: "No source row for detected URL",
            },
          };
        } else {
          // Use explicit context key from ext_* row (RFC-0104: no LIMIT 1 ownership guessing)
          const sitePage = pagesDb
            .prepare<[number], { site_id: number }>(`SELECT site_id FROM site_pages WHERE id = ?`)
            .get(primaryRow.page_observation_id) as { site_id: number } | undefined;

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
            evidencePayload = {
              schemaVersion: 1,
              stage: "detected-page-capture",
              siteId: 0,
              provisionalAssetId: wk.provisionalAssetId,
              url: item.url,
              result: {
                ok: false,
                httpStatus: null,
                errorCode: "NO_SITE_PAGE",
                errorMsg: "Detected URL has no owning site_page",
              },
            };
          } else {
            // Check if already fetched and apply hardcoded rescan policy (B.2)
            // Policy: error rows always re-fetched, OK rows never re-fetched (skip)
            const existingSitePage = pagesDb
              .prepare<[number, string], { id: number }>(
                `SELECT id FROM site_pages WHERE site_id = ? AND url_sha256 = ?`,
              )
              .get(sitePage.site_id, urlSha256);

            const hasObservation = existingSitePage
              ? (pagesDb
                  .prepare<[number], { content_sha256: string }>(
                    `SELECT content_sha256 FROM page_observations WHERE site_page_id = ? LIMIT 1`,
                  )
                  .get(existingSitePage.id) as { content_sha256: string } | undefined)
              : undefined;

            if (hasObservation) {
              const updatedRows = updateDetectedSources(
                pagesDb,
                item.rows,
                hasObservation.content_sha256,
              );
              // Successfully fetched before — never re-fetch OK rows. The page
              // content is already captured, so the target seals as succeeded.
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
              evidencePayload = {
                schemaVersion: 1,
                stage: "detected-page-capture",
                siteId: sitePage.site_id,
                provisionalAssetId: wk.provisionalAssetId,
                url: item.url,
                result: {
                  ok: true,
                  httpStatus: 200,
                  finalUrl: item.url,
                  contentHash: hasObservation.content_sha256,
                  contentLengthBytes: 0,
                  isNewContent: false,
                },
              };
            } else {
              // No page_observation means previous fetch failed — re-fetch.
              const result = await withLeaseHeartbeat(journal, attempt, leaseDurationMs, async () =>
                fetchPageContent(item.url, { timeoutMs: brief.timeoutMs }),
              );
              const fetched = result.ok
                ? result
                : result.errorCode === "SSL_ERROR" ||
                    result.errorCode === "ENOTFOUND" ||
                    result.errorCode === "ETIMEDOUT"
                  ? await withLeaseHeartbeat(journal, attempt, leaseDurationMs, async () =>
                      fetchPageContent(item.url.replace(/^https:/, "http:"), {
                        timeoutMs: brief.timeoutMs,
                      }),
                    )
                  : result;

              if (!fetched.ok || fetched.httpStatus === null || fetched.httpStatus >= 400) {
                stats.push({
                  url: item.url,
                  source_table: sourceTablesLabel(item.rows),
                  ok: false,
                  httpStatus: fetched.ok ? fetched.httpStatus : null,
                  isNewContent: false,
                  errorCode: fetched.ok ? `HTTP_${fetched.httpStatus}` : fetched.errorCode,
                  updatedRows: 0,
                });
                evidencePayload = {
                  schemaVersion: 1,
                  stage: "detected-page-capture",
                  siteId: sitePage.site_id,
                  provisionalAssetId: wk.provisionalAssetId,
                  url: item.url,
                  result: {
                    ok: false,
                    httpStatus: fetched.ok ? fetched.httpStatus : null,
                    errorCode: fetched.ok ? `HTTP_${fetched.httpStatus}` : fetched.errorCode,
                    errorMsg: fetched.ok ? `HTTP ${fetched.httpStatus}` : fetched.errorMsg,
                  },
                };
              } else {
                fetchedOk = true;
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

                upsertPageObservation(pagesDb, sitePageId, sha256, isNewContent, "ok", {
                  urlFinal: fetched.finalUrl,
                  deviceId: brief.deviceId,
                  sourceToken: brief.sourceToken,
                });

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
                evidencePayload = {
                  schemaVersion: 1,
                  stage: "detected-page-capture",
                  siteId: sitePage.site_id,
                  provisionalAssetId: wk.provisionalAssetId,
                  url: item.url,
                  result: {
                    ok: true,
                    httpStatus: fetched.httpStatus,
                    finalUrl: fetched.finalUrl,
                    contentHash: sha256,
                    contentLengthBytes: fetched.contentLengthBytes,
                    isNewContent,
                  },
                };
              }
            }
          }
        }

        completed++;
        if (fetchedOk) Atomics.add(okCountShared, 0, 1);
        if (completed % logEvery === 0 || completed === uniqueUrls.length) {
          logProgress(this.id, completed, uniqueUrls.length, logEvery, true);
        }

        // RFC-0114 B4b: Commit through durable authority — every declared
        // target resolves to a terminal state so the stage seal balances.
        const evidence = await writeExecutionCasObject(capsuleDir, evidencePayload);
        commitAttempt(durableDb, {
          workKeyId: wkId,
          attemptId: durableAttemptId,
          epoch,
          measuredAt,
          inputFingerprint: configSha,
          evidence: [{ role: "detected-page", sha256: evidence.sha256, bytes: 0 }],
          outcome: evidencePayload.result.ok ? "succeeded" : "failed",
        });
        await journal.finish(attempt, {
          eventId: mintAssetId(),
          now: new Date().toISOString(),
          state: evidencePayload.result.ok ? "succeeded" : "observed-failure",
          resultSha256: evidence.sha256,
          ...(!evidencePayload.result.ok ? { errorClass: evidencePayload.result.errorCode } : {}),
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

      // RFC-0114 B4b: Seal detected-page-capture stage when all targets are terminal
      if (brief.maxDomains < 0) {
        // RFC-0128: pages-*.db is final at this seal — snapshot it into the
        // capsule under the profile instrument namespace.
        const pagesDbArtifact = await snapshotCapsuleDbArtifact(
          capsuleDir,
          "profile",
          brief.deviceId,
          pagesDbPath,
        );
        await journal.sealStage({
          stageId: "detected-page-capture",
          keys: stageTargetKeys,
          eventId: mintAssetId(),
          now: new Date().toISOString(),
          outputArtifacts: [pagesDbArtifact],
        });
      }
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
