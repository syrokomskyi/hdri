/*
<MODULE_CONTRACT>
<purpose>Run Google Lighthouse against all live sites, persist raw JSON reports to CAS, and record per-site scores and Web Vitals into audits_YYYY.db.</purpose>
<keywords>lighthouse, performance, accessibility, seo, best-practices, lcp, cls, tbt, audit</keywords>
<responsibilities>
  <item>Query registry.db for all live sites (no cohort sampling).</item>
  <item>Run Lighthouse live mode per target under rate-limited concurrency.</item>
  <item>Persist raw JSON reports to content-addressed storage.</item>
  <item>Upsert per-site rows in audit_runs and lighthouse_runs.</item>
  <item>Emit lighthouse-results.json, lighthouse-report.md, and lighthouse-results.csv artifacts.</item>
</responsibilities>
<non-goals>
  <item>Does not run axe-core accessibility checks (handled by AxeAuditGogol).</item>
  <item>Does not aggregate cross-batch statistics.</item>
  <item>Does not support fixture mode (removed in Phase B).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="LighthouseReport">Subset of the Lighthouse JSON report shape consumed by this gogol.</entry>
  <entry key="Extracted">Normalised per-site scores and Web Vitals extracted from a LighthouseReport.</entry>
  <entry key="extract">Pure function mapping LighthouseReport → Extracted.</entry>
  <entry key="runLighthouseLive">Dynamically imports lighthouse + chrome-launcher and drives a headless Chrome run.</entry>
  <entry key="loadTargetsFromRegistryDb">Query registry.db for all live sites to audit.</entry>
  <entry key="upsertEnvelope">Upserts a row in audit_runs.</entry>
  <entry key="upsertLighthouse">Upserts a row in lighthouse_runs.</entry>
  <entry key="LighthouseAuditGogol">Gogol that orchestrates the Lighthouse audit across the first N live sites.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: fixture + live dual-mode Lighthouse runner with rate-limited concurrency, CAS persistence, and DB upserts.</item>
  <item>Emit lighthouse-results.csv with per-site scores for operator review.</item>
  <item>Switch from resumability to deterministic subset: always audit the first N live sites; use ON CONFLICT upsert for idempotent re-runs.</item>
  <item>Fix zero metric bug: use explicit null/undefined check instead of truthy check for lcpMs and tbtMs to preserve 0 values.</item>
  <item>Add formFactor parameter to runLighthouseLive and pass formFactor from brief to Lighthouse flags.</item>
  <item>Remove lighthouse prefix from brief field references - this app is Lighthouse-only.</item>
  <item>Phase B cleanup: remove fixture mode and cohort dependency; query registry.db directly for live sites.</item>
  <item>Remove auditBatchId from upserts, JSON output, and markdown report; update SQL to new schema without batch_id.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Fix try/finally scope: move result-processing variables outside the try block so db.close() runs safely and post-processing remains accessible.</item>
  <item>Resume across restarts: skip sites already recorded in audit_runs before starting the live audit loop.</item>
</CHANGE_SUMMARY>
*/

import { parseSourceToken } from '@org/observatory-crypto';
import path from 'node:path';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { markdownTable } from 'markdown-table';
import { RateLimiter } from '@org/business-rate-limit';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { AuditTarget, PipelineContext } from '../pipeline/types.js';
import { openAuditsDb, openRegistryDbReadOnly, openLivenessDbReadOnly } from '../db/connection.js';
import { getAuditsDbPath } from '../paths.js';
import { writeReportToCas } from '../cas/write-report.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Lighthouse report shape (subset we care about)
// ---------------------------------------------------------------------------

type LighthouseReport = {
  lighthouseVersion?: string;
  finalUrl?: string;
  categories?: {
    performance?: { score: number | null };
    accessibility?: { score: number | null };
    'best-practices'?: { score: number | null };
    seo?: { score: number | null };
  };
  audits?: {
    'largest-contentful-paint'?: { numericValue?: number };
    'cumulative-layout-shift'?:  { numericValue?: number };
    'total-blocking-time'?:      { numericValue?: number };
  };
};

type Extracted = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  lighthouseVersion: string | null;
};

const pct = (x: number | null | undefined): number | null =>
  x === null || x === undefined ? null : Math.round(x * 100);

const extract = (r: LighthouseReport): Extracted => ({
  performance:   pct(r.categories?.performance?.score ?? null),
  accessibility: pct(r.categories?.accessibility?.score ?? null),
  bestPractices: pct(r.categories?.['best-practices']?.score ?? null),
  seo:           pct(r.categories?.seo?.score ?? null),
  lcpMs: r.audits?.['largest-contentful-paint']?.numericValue !== undefined && r.audits?.['largest-contentful-paint']?.numericValue !== null
    ? Math.round(r.audits['largest-contentful-paint']!.numericValue!) : null,
  cls:   r.audits?.['cumulative-layout-shift']?.numericValue ?? null,
  tbtMs: r.audits?.['total-blocking-time']?.numericValue !== undefined && r.audits?.['total-blocking-time']?.numericValue !== null
    ? Math.round(r.audits['total-blocking-time']!.numericValue!) : null,
  lighthouseVersion: r.lighthouseVersion ?? null,
});

// ---------------------------------------------------------------------------
// Live Lighthouse driver — dynamically imported to avoid pulling Chrome into
// the install graph when the user is only running fixture mode.
// ---------------------------------------------------------------------------

const isChromeLauncherEperm = (err: unknown): boolean => {
  const e = err as NodeJS.ErrnoException & { path?: string };
  return e.code === 'EPERM' && typeof e.path === 'string' && e.path.includes('lighthouse.');
};

const runLighthouseLive = async (
  target: AuditTarget,
  timeoutMs: number,
  formFactor: 'desktop' | 'mobile',
): Promise<LighthouseReport> => {
  let chromeLauncher: any;
  let lighthouse: any;
  try {
    chromeLauncher = await import('chrome-launcher' as string);
    lighthouse = await import('lighthouse' as string);
  } catch {
    throw new Error(
      'Live Lighthouse mode requires the `lighthouse` and `chrome-launcher` ' +
      'packages to be installed.',
    );
  }

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    const runner = (lighthouse.default ?? lighthouse) as unknown as (
      url: string,
      flags: Record<string, unknown>,
    ) => Promise<{ lhr: unknown }>;

    const result = await Promise.race([
      runner(target.url, { port: chrome.port, output: 'json', logLevel: 'error', formFactor }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('lighthouse_timeout')), timeoutMs),
      ),
    ]);
    return (result as { lhr: LighthouseReport }).lhr;
  } finally {
    try {
      await Promise.race([
        chrome.kill(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('chrome_kill_timeout')), 5_000),
        ),
      ]);
    } catch (cleanupErr: any) {
      if (isChromeLauncherEperm(cleanupErr) || cleanupErr?.message === 'chrome_kill_timeout') {
        console.warn(
          `[lighthouse-audit] Chrome temp cleanup issue, ignoring: ${cleanupErr.message}`,
        );
      } else {
        // eslint-disable-next-line no-unsafe-finally
        throw cleanupErr;
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Load targets from registry.db (Phase B: removed cohort/fixture, query all live sites)
// ---------------------------------------------------------------------------

const loadTargetsFromRegistryDb = (
  registryDbPath: string,
  livenessDbPath: string,
  sampleSize: number,
): AuditTarget[] => {
  const db = openRegistryDbReadOnly(registryDbPath);
  const livenessDb = openLivenessDbReadOnly(livenessDbPath);
  try {
    const rows = db.prepare(`
      SELECT s.id AS siteId, s.domain, s.bundesland
      FROM sites s
      ORDER BY s.id
    `).all() as Array<Pick<AuditTarget, 'siteId' | 'domain' | 'bundesland'>>;

    // Get live site IDs from liveness.db
    const liveRows = livenessDb.prepare(`SELECT site_id FROM liveness_checks WHERE is_live = 1`).all() as { site_id: number }[];
    const liveSiteIds = new Set(liveRows.map(r => r.site_id));

    // Build full URLs from domains, keep only live sites
    const allTargets: AuditTarget[] = rows
      .filter(r => liveSiteIds.has(r.siteId))
      .map(r => ({
        siteId: r.siteId,
        domain: r.domain,
        url: `https://${r.domain}`,
        bundesland: r.bundesland,
      }));

    // Deterministic subset: always audit the first N live sites
    const limit = sampleSize > 0 ? sampleSize : allTargets.length;
    const result = allTargets.slice(0, limit);
    console.log(`[lighthouse-audit] allTargets=${allTargets.length} limit=${limit} returning ${result.length} target(s)`);
    return result;
  } finally {
    db.close();
    livenessDb.close();
  }
};

// ---------------------------------------------------------------------------
// DB upserts
// ---------------------------------------------------------------------------

const upsertEnvelope = (db: Database.Database, row: {
  tool: string; siteId: number; url: string;
  durationMs: number; ok: boolean; errorClass: string | null;
  errorMessage: string | null; reportSha256: string | null; source: string;
}): void => {
  db.prepare(`
    INSERT INTO audit_runs (
      tool, site_id, url, duration_ms,
      ok, error_class, error_message, report_sha256, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool, site_id) DO UPDATE SET
      url           = excluded.url,
      duration_ms   = excluded.duration_ms,
      ok            = excluded.ok,
      error_class   = excluded.error_class,
      error_message = excluded.error_message,
      report_sha256 = excluded.report_sha256,
      source        = excluded.source,
      fetched_at    = unixepoch()
  `).run(
    row.tool, row.siteId, row.url, row.durationMs,
    row.ok ? 1 : 0, row.errorClass, row.errorMessage, row.reportSha256, row.source,
  );
};

const upsertLighthouse = (db: Database.Database, siteId: number,
  x: Extracted, reportSha256: string | null): void => {
  db.prepare(`
    INSERT INTO lighthouse_runs (
      site_id, performance, accessibility, best_practices, seo,
      lcp_ms, cls, tbt_ms, lighthouse_version, report_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      performance        = excluded.performance,
      accessibility      = excluded.accessibility,
      best_practices     = excluded.best_practices,
      seo                = excluded.seo,
      lcp_ms             = excluded.lcp_ms,
      cls                = excluded.cls,
      tbt_ms             = excluded.tbt_ms,
      lighthouse_version = excluded.lighthouse_version,
      report_sha256      = excluded.report_sha256
  `).run(
    siteId, x.performance, x.accessibility, x.bestPractices, x.seo,
    x.lcpMs, x.cls, x.tbtMs, x.lighthouseVersion, reportSha256,
  );
};

// ---------------------------------------------------------------------------

export class LighthouseAuditGogol extends Gogol {
  override readonly id = 'lighthouse-audit';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, resolvedRegistryDbPath, resolvedLivenessDbPath } = ctx.state;

    const onUncaught = (err: Error) => {
      if (isChromeLauncherEperm(err)) {
        console.warn(`[lighthouse-audit] Chrome temp cleanup failed (EPERM), ignoring: ${err.message}`);
        return;
      }
      process.removeListener('uncaughtException', onUncaught);
      console.error(err);
      process.exit(1);
    };
    process.on('uncaughtException', onUncaught);

    try {
      // Derive year from sourceToken (B.1 cleanup)
      const { year } = parseSourceToken(brief.sourceToken);

      // Phase B: Query registry.db for live sites, respecting sample size
      const targets = loadTargetsFromRegistryDb(resolvedRegistryDbPath, resolvedLivenessDbPath, brief.auditSampleSize);
      if (targets.length === 0) {
        console.log('[lighthouse-audit] No targets (empty registry or no live sites)');
        return;
      }

      console.log(
        `[lighthouse-audit] mode=live ` +
        `targets=${targets.length} concurrency=${brief.concurrency}`,
      );

      const limiter = new RateLimiter({
        concurrency: brief.concurrency,
        retry: {
          retries: brief.retries,
          baseDelayMs: 500,
          maxDelayMs: 5_000,
          jitter: true,
        },
        breaker: {
          // If Chrome is broken on this machine, don't punish every site.
          threshold: Math.max(3, Math.floor(targets.length * 0.2)),
          cooldownMs: 30_000,
          windowMs: 120_000,
        },
      });

      type Outcome = {
        siteId: number; ok: boolean;
        errorClass: string | null; durationMs: number;
        reportSha256: string | null; extracted: Extracted | null;
      };
      const results: Outcome[] = [];
      let completed = 0;
      const totalTargets = targets.length;
      const progressInterval = Math.max(1, Math.min(10, Math.floor(totalTargets / 5)));

      const auditsDb = openAuditsDb(getAuditsDbPath(year));

      // Resume: skip sites already recorded in audit_runs
      const auditedSiteIds = new Set(
        (auditsDb.prepare(`SELECT site_id FROM audit_runs WHERE tool = 'lighthouse'`)
          .all() as { site_id: number }[]).map((r) => r.site_id),
      );
      const pendingTargets = targets.filter((t) => !auditedSiteIds.has(t.siteId));
      if (auditedSiteIds.size > 0) {
        console.log(`[lighthouse-audit] Resuming: ${auditedSiteIds.size} already audited, ${pendingTargets.length} remaining.`);
      }
      if (pendingTargets.length === 0) {
        console.log('[lighthouse-audit] All targets already audited.');
        auditsDb.close();
        return;
      }

      try {
        await Promise.all(pendingTargets.map((target) =>
          limiter.schedule(async () => {
            const startedAt = Date.now();
            try {
              const report = await runLighthouseLive(target, brief.timeoutMs, brief.formFactor);

              const { sha256 } = await writeReportToCas('lighthouse', JSON.stringify(report));
              const extracted = extract(report);
              const durationMs = Date.now() - startedAt;

              upsertEnvelope(auditsDb, {
                tool: 'lighthouse', siteId: target.siteId, url: target.url,
                durationMs, ok: true, errorClass: null, errorMessage: null,
                reportSha256: sha256, source: 'live',
              });
              upsertLighthouse(auditsDb, target.siteId, extracted, sha256);

              results.push({
                siteId: target.siteId, ok: true, errorClass: null,
                durationMs, reportSha256: sha256, extracted,
              });
              completed++;
              logProgress(this.id, completed, totalTargets, progressInterval, true);
              console.log(
                `[lighthouse-audit] site ${target.siteId} (${target.domain}) ok in ${durationMs}ms ` +
                `perf=${extracted.performance ?? '-'} a11y=${extracted.accessibility ?? '-'} ` +
                `seo=${extracted.seo ?? '-'}`
              );
            } catch (err) {
              const durationMs = Date.now() - startedAt;
              const errorClass = err instanceof Error && /timeout/i.test(err.message)
                ? 'timeout'
                : 'error';
              const errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);

              upsertEnvelope(auditsDb, {
                tool: 'lighthouse', siteId: target.siteId, url: target.url,
                durationMs, ok: false, errorClass, errorMessage,
                reportSha256: null, source: 'live',
              });
              results.push({
                siteId: target.siteId, ok: false, errorClass, durationMs,
                reportSha256: null, extracted: null,
              });
              completed++;
              logProgress(this.id, completed, totalTargets, progressInterval, true);
              console.log(
                `[lighthouse-audit] site ${target.siteId} (${target.domain}) FAILED (${errorClass}) in ${durationMs}ms: ${errorMessage.slice(0, 120)}`
              );
            }
          }),
        ));
      } finally {
        auditsDb.close();
      }

      const okCount = results.filter((r) => r.ok).length;
      const okExtracted = results.filter((r) => r.extracted).map((r) => r.extracted!);
      const avg = (fn: (x: Extracted) => number | null): string => {
        const vals = okExtracted.map(fn).filter((v): v is number => v !== null);
        if (vals.length === 0) return '—';
        return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
      };

      console.log(
        `[lighthouse-audit] done: ${okCount}/${results.length} ok — ` +
        `avg perf=${avg((x) => x.performance)} a11y=${avg((x) => x.accessibility)} ` +
        `seo=${avg((x) => x.seo)} bp=${avg((x) => x.bestPractices)}`,
      );

      const outDir = ctx.getGogolOutputDir(this.id);
      await ctx.writeTextFile(
        path.join(outDir, 'lighthouse-results.json'),
        JSON.stringify({ mode: 'live', results }, null, 2),
      );

      // Build target lookup for CSV enrichment
      const targetById = new Map(targets.map((t) => [t.siteId, t]));
      await ctx.writeTextFile(
        path.join(outDir, 'lighthouse-results.csv'),
        csvStringify([
          ['site_id', 'domain', 'ok', 'error_class', 'duration_ms',
            'performance', 'accessibility', 'best_practices', 'seo',
            'lcp_ms', 'cls', 'tbt_ms', 'report_sha256'],
          ...results.map((r) => {
            const t = targetById.get(r.siteId);
            return [
              r.siteId,
              t?.domain ?? '',
              r.ok ? 'true' : 'false',
              r.errorClass ?? '',
              r.durationMs,
              r.extracted?.performance ?? '',
              r.extracted?.accessibility ?? '',
              r.extracted?.bestPractices ?? '',
              r.extracted?.seo ?? '',
              r.extracted?.lcpMs ?? '',
              r.extracted?.cls ?? '',
              r.extracted?.tbtMs ?? '',
              r.reportSha256 ?? '',
            ];
          }),
        ]),
      );

      await ctx.writeTextFile(
        path.join(outDir, 'lighthouse-report.md'),
        [
          `# Lighthouse audit`,
          ``,
          `**Batch:** audit  `,
          `**Mode:** live  `,
          `**Sites:** ${results.length} (ok: ${okCount})`,
          ``,
          `## Averages (ok only)`,
          ``,
          markdownTable(
            [
              ['Metric', 'Avg'],
              ['Performance', avg((x) => x.performance)],
              ['Accessibility', avg((x) => x.accessibility)],
              ['Best Practices', avg((x) => x.bestPractices)],
              ['SEO', avg((x) => x.seo)],
              ['LCP (ms)', avg((x) => x.lcpMs)],
              ['TBT (ms)', avg((x) => x.tbtMs)],
            ],
            { align: ['l', 'r'] },
          ),
        ].join('\n'),
      );
    } finally {
      process.removeListener('uncaughtException', onUncaught);
    }
  }
}

