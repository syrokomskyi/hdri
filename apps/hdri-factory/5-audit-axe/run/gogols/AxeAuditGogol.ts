/*
<MODULE_CONTRACT>
<purpose>Run axe-core accessibility checks against all live sites, persist raw JSON reports to CAS, and record per-site violation counts into audits_YYYY.db.</purpose>
<keywords>axe, accessibility, a11y, wcag, violations, audit</keywords>
<responsibilities>
  <item>Query registry.db for all live sites (no cohort sampling).</item>
  <item>Run axe-core live mode per target under rate-limited concurrency.</item>
  <item>Persist raw JSON reports to content-addressed storage.</item>
  <item>Upsert per-site rows in audit_runs and axe_runs.</item>
  <item>Emit axe-results.json, axe-report.md, and axe-results.csv artifacts.</item>
</responsibilities>
<non-goals>
  <item>Does not run Lighthouse performance checks (separate pipeline: 4-audit-lighthouse).</item>
  <item>Does not aggregate cross-batch statistics.</item>
  <item>Does not support fixture mode (removed in Phase B).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AxeImpact">Union type for axe violation impact levels.</entry>
  <entry key="AxeReport">Minimal subset of the axe-core JSON report shape consumed by this gogol.</entry>
  <entry key="Extracted">Normalised per-site violation counts extracted from an AxeReport.</entry>
  <entry key="extract">Pure function mapping AxeReport → Extracted.</entry>
  <entry key="runAxeLive">Dynamically imports Playwright + @axe-core/playwright and drives a headless browser run.</entry>
  <entry key="loadTargetsFromRegistryDb">Query registry.db for all live sites to audit.</entry>
  <entry key="upsertEnvelope">Upserts a row in audit_runs.</entry>
  <entry key="upsertAxe">Upserts a row in axe_runs.</entry>
  <entry key="AxeAuditGogol">Gogol that orchestrates the axe-core audit across all live sites.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: fixture + live dual-mode axe runner with rate-limited concurrency, CAS persistence, and DB upserts.</item>
  <item>Switch from resumability to deterministic subset: always audit the first N live sites; use ON CONFLICT upsert for idempotent re-runs.</item>
  <item>Emit axe-results.csv with per-site violation counts for operator review.</item>
  <item>Remove axe prefix from brief field references - this app is Axe-only.</item>
  <item>Phase B cleanup: remove fixture mode and cohort dependency; query registry.db directly for live sites.</item>
  <item>Remove auditBatchId from upserts, JSON output, and markdown report; update SQL to new schema without batch_id.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
  <item>Resume across restarts: skip sites already recorded in audit_runs before starting the live audit loop.</item>
  <item>Fix GRACE non-goal: replace wrong LighthouseAuditGogol class reference with pipeline reference.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { parseSourceToken } from '@org/observatory-crypto';
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
// Axe report shape — minimal subset we care about
// ---------------------------------------------------------------------------

type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

type AxeReport = {
  testEngine?: { name?: string; version?: string };
  violations?: Array<{
    id: string;
    impact?: AxeImpact | null;
    nodes?: Array<unknown>;
  }>;
  /** Some axe-core outputs include total nodes scanned here. Optional. */
  nodesScanned?: number;
};

type Extracted = {
  violationsTotal: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  nodesScanned: number | null;
  axeVersion: string | null;
};

const extract = (r: AxeReport): Extracted => {
  const violations = r.violations ?? [];
  const by: Record<AxeImpact, number> = {
    critical: 0, serious: 0, moderate: 0, minor: 0,
  };
  for (const v of violations) {
    if (v.impact && v.impact in by) by[v.impact] += v.nodes?.length ?? 1;
  }
  return {
    violationsTotal: violations.reduce((s, v) => s + (v.nodes?.length ?? 1), 0),
    criticalCount:   by.critical,
    seriousCount:    by.serious,
    moderateCount:   by.moderate,
    minorCount:      by.minor,
    nodesScanned:    r.nodesScanned ?? null,
    axeVersion:      r.testEngine?.version ?? null,
  };
};

// ---------------------------------------------------------------------------
// Live axe driver — dynamic import, fails cleanly if Playwright is absent.
// ---------------------------------------------------------------------------

const runAxeLive = async (
  target: AuditTarget,
  timeoutMs: number,
): Promise<AxeReport> => {
  let playwright: any;
  let AxeBuilder: any;
  try {
    playwright = await import('playwright' as string);
    const mod: any = await import('@axe-core/playwright' as string);
    AxeBuilder = mod.default ?? mod;
  } catch {
    throw new Error(
      'Live axe mode requires `playwright` and `@axe-core/playwright` to be installed.',
    );
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const results = await new AxeBuilder({ page }).analyze();
    return results as unknown as AxeReport;
  } finally {
    await browser.close();
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
    console.log(`[axe-audit] allTargets=${allTargets.length} limit=${limit} returning ${result.length} target(s)`);
    return result;
  } finally {
    db.close();
    livenessDb.close();
  }
};

// ---------------------------------------------------------------------------

const upsertEnvelope = (db: Database.Database, row: {
  siteId: number; url: string;
  durationMs: number; ok: boolean; errorClass: string | null;
  errorMessage: string | null; reportSha256: string | null; source: string;
}): void => {
  db.prepare(`
    INSERT INTO audit_runs (
      tool, site_id, url, duration_ms,
      ok, error_class, error_message, report_sha256, source
    ) VALUES ('axe', ?, ?, ?, ?, ?, ?, ?, ?)
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
    row.siteId, row.url, row.durationMs,
    row.ok ? 1 : 0, row.errorClass, row.errorMessage, row.reportSha256, row.source,
  );
};

const upsertAxe = (db: Database.Database, siteId: number,
  x: Extracted, reportSha256: string | null): void => {
  db.prepare(`
    INSERT INTO axe_runs (
      site_id, violations_total,
      critical_count, serious_count, moderate_count, minor_count,
      nodes_scanned, axe_version, report_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      violations_total = excluded.violations_total,
      critical_count   = excluded.critical_count,
      serious_count    = excluded.serious_count,
      moderate_count   = excluded.moderate_count,
      minor_count      = excluded.minor_count,
      nodes_scanned    = excluded.nodes_scanned,
      axe_version      = excluded.axe_version,
      report_sha256    = excluded.report_sha256
  `).run(
    siteId, x.violationsTotal,
    x.criticalCount, x.seriousCount, x.moderateCount, x.minorCount,
    x.nodesScanned, x.axeVersion, reportSha256,
  );
};

// ---------------------------------------------------------------------------

export class AxeAuditGogol extends Gogol {
  override readonly id = 'axe-audit';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, resolvedRegistryDbPath, resolvedLivenessDbPath } = ctx.state;

    // Derive year from sourceToken (B.1 cleanup)
    const { year } = parseSourceToken(brief.sourceToken);

    // Open audits DB for upserts
    const auditsDb = openAuditsDb(getAuditsDbPath(year));

    // Phase B: Query registry.db for live sites, respecting sample size
    const targets = loadTargetsFromRegistryDb(resolvedRegistryDbPath, resolvedLivenessDbPath, brief.auditSampleSize);
    if (targets.length === 0) {
      console.log('[axe-audit] No targets (empty registry or no live sites)');
      auditsDb.close();
      return;
    }

    // Resume: skip sites already recorded in audit_runs
    const auditedSiteIds = new Set(
      (auditsDb.prepare(`SELECT site_id FROM audit_runs WHERE tool = 'axe'`)
        .all() as { site_id: number }[]).map((r) => r.site_id),
    );
    const pendingTargets = targets.filter((t) => !auditedSiteIds.has(t.siteId));
    if (auditedSiteIds.size > 0) {
      console.log(`[axe-audit] Resuming: ${auditedSiteIds.size} already audited, ${pendingTargets.length} remaining.`);
    }
    if (pendingTargets.length === 0) {
      console.log('[axe-audit] All targets already audited.');
      auditsDb.close();
      return;
    }

    console.log(
      `[axe-audit] mode=live ` +
      `targets=${pendingTargets.length} concurrency=${brief.concurrency}`,
    );

    const limiter = new RateLimiter({
      concurrency: brief.concurrency,
      retry: {
        retries: brief.retries,
        baseDelayMs: 500, maxDelayMs: 5_000, jitter: true,
      },
      breaker: {
        threshold: Math.max(3, Math.floor(targets.length * 0.2)),
        cooldownMs: 30_000, windowMs: 120_000,
      },
    });

    type Outcome = {
      siteId: number; ok: boolean; errorClass: string | null;
      durationMs: number; extracted: Extracted | null;
    };
    const results: Outcome[] = [];
    let completed = 0;
    const totalTargets = pendingTargets.length;
    const progressInterval = Math.max(1, Math.min(10, Math.floor(totalTargets / 5)));

    await Promise.all(pendingTargets.map((target) =>
      limiter.schedule(async () => {
        const startedAt = Date.now();
        try {
          const report = await runAxeLive(target, brief.timeoutMs);

          const { sha256 } = await writeReportToCas('axe', JSON.stringify(report));
          const extracted = extract(report);
          const durationMs = Date.now() - startedAt;

          upsertEnvelope(auditsDb, {
            siteId: target.siteId, url: target.url,
            durationMs, ok: true, errorClass: null, errorMessage: null,
            reportSha256: sha256, source: 'live',
          });
          upsertAxe(auditsDb, target.siteId, extracted, sha256);

          results.push({ siteId: target.siteId, ok: true, errorClass: null, durationMs, extracted });
          completed++;
          logProgress(this.id, completed, totalTargets, progressInterval, true);
          console.log(
            `[axe-audit] site ${target.siteId} (${target.domain}) ok in ${durationMs}ms ` +
            `violations=${extracted.violationsTotal} (crit=${extracted.criticalCount} ` +
            `ser=${extracted.seriousCount} mod=${extracted.moderateCount} ` +
            `min=${extracted.minorCount})`,
          );
        } catch (err) {
          const durationMs = Date.now() - startedAt;
          const errorClass = err instanceof Error && /timeout/i.test(err.message)
            ? 'timeout'
            : 'error';
          const errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
          upsertEnvelope(auditsDb, {
            siteId: target.siteId, url: target.url,
            durationMs, ok: false, errorClass, errorMessage,
            reportSha256: null, source: 'live',
          });
          results.push({ siteId: target.siteId, ok: false, errorClass, durationMs, extracted: null });
          completed++;
          logProgress(this.id, completed, totalTargets, progressInterval, true);
          console.log(
            `[axe-audit] site ${target.siteId} (${target.domain}) FAILED (${errorClass}) in ${durationMs}ms: ${errorMessage.slice(0, 120)}`,
          );
        }
      }),
    ));

    auditsDb.close();

    const okCount = results.filter((r) => r.ok).length;
    const okExtracted = results.filter((r) => r.extracted).map((r) => r.extracted!);
    const sum = (fn: (x: Extracted) => number): number =>
      okExtracted.reduce((s, x) => s + fn(x), 0);

    console.log(
      `[axe-audit] done: ${okCount}/${results.length} ok — ` +
      `total violations=${sum((x) => x.violationsTotal)} ` +
      `(crit=${sum((x) => x.criticalCount)} ` +
      `ser=${sum((x) => x.seriousCount)} ` +
      `mod=${sum((x) => x.moderateCount)} ` +
      `min=${sum((x) => x.minorCount)})`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'axe-results.json'),
      JSON.stringify({ mode: 'live', results }, null, 2),
    );

    // Build target lookup for CSV enrichment
    const targetById = new Map(targets.map((t) => [t.siteId, t]));
    await ctx.writeTextFile(
      path.join(outDir, 'axe-results.csv'),
      csvStringify([
        ['site_id', 'domain', 'ok', 'error_class', 'duration_ms',
          'violations_total', 'critical', 'serious', 'moderate', 'minor'],
        ...results.map((r) => {
          const t = targetById.get(r.siteId);
          return [
            r.siteId,
            t?.domain ?? '',
            r.ok ? 'true' : 'false',
            r.errorClass ?? '',
            r.durationMs,
            r.extracted?.violationsTotal ?? '',
            r.extracted?.criticalCount ?? '',
            r.extracted?.seriousCount ?? '',
            r.extracted?.moderateCount ?? '',
            r.extracted?.minorCount ?? '',
          ];
        }),
      ]),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'axe-report.md'),
      [
        `# axe-core audit`,
        ``,
        `**Batch:** audit  `,
        `**Mode:** live  `,
        `**Sites:** ${results.length} (ok: ${okCount})`,
        ``,
        `## Totals (ok only)`,
        ``,
        markdownTable(
          [
            ['Impact', 'Count'],
            ['Critical', String(sum((x) => x.criticalCount))],
            ['Serious', String(sum((x) => x.seriousCount))],
            ['Moderate', String(sum((x) => x.moderateCount))],
            ['Minor', String(sum((x) => x.minorCount))],
            ['**Total**', `**${sum((x) => x.violationsTotal)}**`],
          ],
          { align: ['l', 'r'] },
        ),
      ].join('\n'),
    );
  }
}

