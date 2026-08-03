/*
<MODULE_CONTRACT>
<purpose>Fetches homepages for live domains and persists raw HTML in CAS storage.</purpose>
<non-goals>
  <item>Do not perform any signal extraction here — that is the responsibility of Extract gogols.</item>
  <item>Do not query or write ext_* tables.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Heartbeat long-running profile captures while retaining terminal CAS fencing.</item>
  <item>Created CrawlGogol as the pure-crawl replacement for the former CrawlAndExtractGogol.</item>
  <item>Renamed gogol id from 'crawl' to 'crawl-pages' to avoid collision with the 'crawl' phase id in phase-registry.ts.</item>
  <item>Fix HTTP fallback: fallback to HTTP on network-level failures (SSL_ERROR, ENOTFOUND, ETIMEDOUT) instead of keeping HTTPS result.</item>
  <item>Fix restart/continuation: filter already-observed pages BEFORE processing loop (like 2-check-liveness), then load full stats from database at end.</item>
  <item>Fix fetched counter race condition: use Atomics.add/Atomics.load with SharedArrayBuffer for thread-safe counter instead of stats.filter in concurrent workers.</item>
  <item>Fix cross-database query: attach registry.db to pages_YYYY.db to access site_pages and sites tables in the final report query.</item>
  <item>Fix column reference error: remove http_status from report query since page_contents table doesn't store this column.</item>
  <item>Fix column name mismatch: schema has error_class (not error_code), and success is 'ok' (not null) because the column is TEXT NOT NULL DEFAULT 'ok'.</item>
  <item>Fix resume filter mismatch: query site_ids directly from site_pages+page_observations join instead of computing URL hashes, to handle HTTP fallback and redirects correctly.</item>
  <item>Fix first-run error: wrap page_observations query in try-catch to COMPASSfully handle missing table on initial pipeline run, instead of pre-checking which had race conditions.</item>
  <item>Phase B.2: Hardcoded rescan policy - OK rows never re-fetched, error rows always re-fetched.</item>
  <item>Remove livenessBatchId filter; query all live sites without batch filter.</item>
  <item>Move site_pages writes from registry.db to pages_YYYY.db; site-profile no longer writes to upstream registry.db.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix idempotency: restrict resume filter to homepage source only (sp.source = 'homepage') so detected pages do not incorrectly mask failed homepages.</item>
  <item>Extract shared page-DB helpers (normalisePageUrl, sha256Hex, upsertPageContent, upsertSitePage, getOrCreateSitePage, upsertPageObservation) to db/page-helpers.ts.</item>
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
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  withLeaseHeartbeat,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
} from "@syrokomskyi/factory-core";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openPagesDb, openReadOnlyDb } from "../db/connection.js";
import {
  normalisePageUrl,
  sha256Hex,
  upsertPageContent,
  upsertSitePage,
  getOrCreateSitePage,
  upsertPageObservation,
} from "../db/page-helpers.js";
import {
  getContentDir,
  getContentFilePath,
  getContentRelativePath,
  getPagesDbPath,
} from "../paths.js";
import { factoryRootDir } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SiteRow = { id: number; domain: string; provisionalAssetId: string };

type ProfileEvidence = {
  schemaVersion: 1;
  stage: "profile";
  siteId: number;
  provisionalAssetId: string;
  domain: string;
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
// Gogol
// ---------------------------------------------------------------------------

export class CrawlGogol extends Gogol {
  override readonly id = "crawl-pages";

  override async run(ctx: PipelineContext): Promise<void> {
    const { resolvedRegistryDbPath, resolvedLivenessDbPath, brief, pagesDbName } = ctx.state;

    // ── 1. Build domain list ──────────────────────────────────────────────
    const livenessDb = openReadOnlyDb(resolvedLivenessDbPath);

    let sites: SiteRow[];

    // B.2: liveOnly is hardcoded to true always
    const liveOnly = true;
    sites = livenessDb
      .prepare(
        `
      SELECT DISTINCT site_id AS id, domain, provisional_asset_id AS provisionalAssetId
      FROM liveness_checks
      WHERE is_live = 1
      ORDER BY site_id
    `,
      )
      .all() as SiteRow[];

    livenessDb.close();

    const stageTargetSites = sites;
    if (brief.maxDomains >= 0) sites = sites.slice(0, brief.maxDomains);

    console.log(
      `[crawl] ${sites.length} domain(s) — liveOnly=${liveOnly} concurrency=${brief.concurrency}`,
    );

    // ── 2. Open pages DB ──────────────────────────────────────────────────
    const pagesDbPath = getPagesDbPath(pagesDbName);
    const pagesDb = openPagesDb(pagesDbPath);
    await fs.mkdir(getContentDir(), { recursive: true });

    // ── 2b. Resume from immutable execution events, not mutable page rows ───
    const parsed = parseSourceToken(brief.sourceToken);
    const period = `${parsed.year}-q${parsed.quarter}` as HdriPeriod;
    const capsuleDir = quarterCapsuleDir(factoryRootDir, brief.deviceId, period, brief.capsuleId);
    const journal = new QuarterExecutionJournal(
      quarterExecutionEventsDir(factoryRootDir, brief.deviceId, period, brief.capsuleId),
      capsuleConfigSha256(period, brief.capsuleId, brief.instrumentPlan),
    );
    await journal.initialize(mintAssetId(), new Date().toISOString());
    const keyFor = (site: SiteRow): WorkKey => ({
      period,
      capsuleId: brief.capsuleId,
      stageId: "profile",
      provisionalAssetId: site.provisionalAssetId as WorkKey["provisionalAssetId"],
      instrumentVersion: "profile-v2",
    });
    await journal.declareStageTargets({
      stageId: "profile",
      keys: stageTargetSites.map(keyFor),
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    const checkpoint = (site: SiteRow, evidence: ProfileEvidence, evidenceSha256: string): void => {
      const initialUrl = normalisePageUrl(`https://${site.domain}`);
      const sitePageId = getOrCreateSitePage(pagesDb, site.id, initialUrl, sha256Hex(initialUrl));
      if (!evidence.result.ok) {
        const errorClass =
          evidence.result.httpStatus == null
            ? "network"
            : evidence.result.httpStatus >= 500
              ? "http_5xx"
              : "http_4xx";
        upsertPageObservation(pagesDb, sitePageId, evidenceSha256, false, errorClass);
        return;
      }
      const result = evidence.result;
      upsertPageContent(
        pagesDb,
        result.contentHash,
        getContentRelativePath(result.contentHash),
        result.contentLengthBytes,
      );
      const finalUrl = normalisePageUrl(result.finalUrl);
      const finalHash = sha256Hex(finalUrl);
      if (finalHash !== sha256Hex(initialUrl))
        upsertSitePage(pagesDb, site.id, finalUrl, finalHash);
      upsertPageObservation(pagesDb, sitePageId, result.contentHash, result.isNewContent);
    };
    for (const site of sites) {
      const sha256 = journal.terminalResultSha256(keyFor(site));
      if (!sha256) continue;
      const evidence = await readExecutionCasObject<ProfileEvidence>(capsuleDir, sha256);
      if (evidence.provisionalAssetId !== site.provisionalAssetId)
        throw new Error(`Profile evidence identity mismatch: ${site.provisionalAssetId}`);
      checkpoint(site, evidence, sha256);
    }
    const originalCount = sites.length;
    sites = sites.filter((site) => !journal.isTerminal(keyFor(site)));
    const skippedCurrentBatch = originalCount - sites.length;
    console.log(
      `[crawl] ${originalCount} target(s) — ${skippedCurrentBatch} terminal, ${sites.length} remaining`,
    );

    // ── 3. Crawl loop ─────────────────────────────────────────────────────
    const stats: CrawlStat[] = [];
    let completed = 0;
    const okCountShared = new Int32Array(new SharedArrayBuffer(4));
    const logEvery = Math.max(1, Math.min(5, Math.ceil(sites.length / 4)));

    const processOne = async (site: SiteRow): Promise<void> => {
      const url = `https://${site.domain}`;
      const startedAt = new Date();
      const leaseDurationMs = brief.timeoutMs * 2 + 60_000;
      const attempt = await journal.begin({
        key: keyFor(site),
        attemptId: mintAssetId(),
        leaseOwner: brief.deviceId,
        now: startedAt.toISOString(),
        leaseExpiresAt: new Date(startedAt.getTime() + leaseDurationMs).toISOString(),
      });
      if (!attempt) return;

      const fetched = await withLeaseHeartbeat(journal, attempt, leaseDurationMs, async () => {
        const result = await fetchPageContent(url, { timeoutMs: brief.timeoutMs });
        return result.ok
          ? result
          : result.errorCode === "SSL_ERROR" ||
              result.errorCode === "ENOTFOUND" ||
              result.errorCode === "ETIMEDOUT"
            ? await fetchPageContent(`http://${site.domain}`, { timeoutMs: brief.timeoutMs })
            : result;
      });

      let evidencePayload: ProfileEvidence;
      if (!fetched.ok || fetched.httpStatus === null || fetched.httpStatus >= 400) {
        evidencePayload = {
          schemaVersion: 1,
          stage: "profile",
          siteId: site.id,
          provisionalAssetId: site.provisionalAssetId,
          domain: site.domain,
          result: {
            ok: false,
            httpStatus: fetched.ok ? fetched.httpStatus : null,
            errorCode: fetched.ok ? `HTTP_${fetched.httpStatus}` : fetched.errorCode,
            errorMsg: fetched.ok ? `HTTP ${fetched.httpStatus}` : fetched.errorMsg,
          },
        };
      } else {
        const contentFilePath = getContentFilePath(fetched.contentHash);
        const isNewContent = !(await fs
          .access(contentFilePath)
          .then(() => true)
          .catch(() => false));
        if (isNewContent) {
          await fs.mkdir(path.dirname(contentFilePath), { recursive: true });
          const temp = `${contentFilePath}.${mintAssetId()}.tmp`;
          await fs.writeFile(temp, fetched.html, "utf8");
          try {
            await fs.link(temp, contentFilePath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          } finally {
            await fs.unlink(temp).catch(() => undefined);
          }
        } else if (sha256Hex(await fs.readFile(contentFilePath, "utf8")) !== fetched.contentHash) {
          throw new Error(`Profile content CAS collision: ${fetched.contentHash}`);
        }
        evidencePayload = {
          schemaVersion: 1,
          stage: "profile",
          siteId: site.id,
          provisionalAssetId: site.provisionalAssetId,
          domain: site.domain,
          result: {
            ok: true,
            httpStatus: fetched.httpStatus,
            finalUrl: fetched.finalUrl,
            contentHash: fetched.contentHash,
            contentLengthBytes: fetched.contentLengthBytes,
            isNewContent,
          },
        };
      }

      const evidence = await writeExecutionCasObject(capsuleDir, evidencePayload);
      await journal.finish(attempt, {
        eventId: mintAssetId(),
        now: new Date().toISOString(),
        state: evidencePayload.result.ok ? "succeeded" : "observed-failure",
        resultSha256: evidence.sha256,
        ...(!evidencePayload.result.ok ? { errorClass: evidencePayload.result.errorCode } : {}),
      });
      checkpoint(site, evidencePayload, evidence.sha256);

      completed++;
      if (evidencePayload.result.ok) Atomics.add(okCountShared, 0, 1);
      if (completed % logEvery === 0 || completed === sites.length) {
        logProgress(this.id, completed, sites.length, logEvery, true);
      }

      if (!evidencePayload.result.ok) {
        stats.push({
          domain: site.domain,
          ok: false,
          httpStatus: evidencePayload.result.httpStatus,
          isNewContent: false,
          errorCode: evidencePayload.result.errorCode,
        });
        return;
      }

      stats.push({
        domain: site.domain,
        ok: true,
        httpStatus: evidencePayload.result.httpStatus,
        isNewContent: evidencePayload.result.isNewContent,
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
    await Promise.all(
      Array.from({ length: Math.min(brief.concurrency, sites.length || 1) }, worker),
    );

    if (brief.maxDomains < 0) {
      await journal.sealStage({
        stageId: "profile",
        keys: stageTargetSites.map(keyFor),
        eventId: mintAssetId(),
        now: new Date().toISOString(),
      });
    }

    pagesDb.close();

    // ── 4. Load full batch stats from database (includes resumed sites) ─────
    const reportDb = openPagesDb(pagesDbPath);

    // Attach registry.db to access sites table (site_pages now lives in pages_YYYY.db)
    reportDb.exec(`ATTACH DATABASE '${resolvedRegistryDbPath.replace(/'/g, "''")}' AS registry`);

    const totalObserved = (
      reportDb.prepare(`SELECT COUNT(*) AS n FROM page_observations`).get() as { n: number }
    ).n;

    const newContentCount = (
      reportDb
        .prepare(`SELECT COUNT(*) AS n FROM page_observations WHERE is_new_content = 1`)
        .get() as { n: number }
    ).n;

    // Load all observations for CSV (full batch from database)
    const allObservations = reportDb
      .prepare(
        `SELECT s.domain, po.is_new_content, po.observed_at
       FROM page_observations po
       JOIN site_pages sp ON po.site_page_id = sp.id
       JOIN registry.sites s ON sp.site_id = s.id
       ORDER BY s.id`,
      )
      .all() as {
      domain: string;
      is_new_content: number;
      observed_at: number;
    }[];

    reportDb.exec("DETACH DATABASE registry");
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

    await ctx.writeTextFile(
      path.join(outDir, "crawl-report.json"),
      JSON.stringify(report, null, 2),
    );

    await ctx.writeTextFile(
      path.join(outDir, "crawl-report.md"),
      [
        `# Crawl — Report`,
        ``,
        `**Batch:** crawl`,
        ``,
        markdownTable(
          [
            ["Metric", "Value"],
            ["Pages observed", String(totalObserved)],
            ["New content (cache miss)", String(newContentCount)],
          ],
          { align: ["l", "r"] },
        ),
      ].join("\n"),
    );

    await ctx.writeTextFile(
      path.join(outDir, "pages-crawled.csv"),
      csvStringify(
        [
          ["domain", "is_new_content", "observed_at"],
          ...allObservations.map((s) => [
            s.domain,
            s.is_new_content ? "true" : "false",
            new Date(s.observed_at * 1000).toISOString(),
          ]),
        ],
        { cast: { boolean: (v) => String(v) } },
      ),
    );
  }
}
