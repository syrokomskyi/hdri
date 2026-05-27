import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// audit_runs — one row per (tool, site_id). Common envelope.
// Detailed tool-specific metrics live in lighthouse_runs / axe_runs below.
// Owner: site-deep-audit (T3).
// ---------------------------------------------------------------------------

export const auditRuns = sqliteTable('audit_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tool: text('tool').notNull(),          // 'lighthouse' | 'axe' | 'gbp'
  siteId: integer('site_id').notNull(),
  url: text('url').notNull(),
  fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch())`),
  durationMs: integer('duration_ms'),
  ok: integer('ok').notNull().default(0), // 0|1
  /** Short machine-readable error tag when ok=0 (e.g. 'timeout', 'chrome_crash'). */
  errorClass: text('error_class'),
  /** Full error message (truncated). */
  errorMessage: text('error_message'),
  /** Content-addressed path of the raw report JSON, if one was produced. */
  reportSha256: text('report_sha256'),
  /** Source tag — 'live' (actual tool) or 'fixture' (replay). */
  source: text('source').notNull().default('live'),
}, (t) => ({
  uniq:      uniqueIndex('ar_tool_site').on(t.tool, t.siteId),
  toolIdx:   index('ar_tool_idx').on(t.tool),
  siteIdx:   index('ar_site_idx').on(t.siteId),
}));

export type AuditRun = typeof auditRuns.$inferSelect;
export type NewAuditRun = typeof auditRuns.$inferInsert;

// ---------------------------------------------------------------------------
// lighthouse_runs — performance / SEO / accessibility / best-practices scores.
// ---------------------------------------------------------------------------

export const lighthouseRuns = sqliteTable('lighthouse_runs', {
  siteId: integer('site_id').notNull().primaryKey(),
  performance: real('performance'),
  accessibility: real('accessibility'),
  bestPractices: real('best_practices'),
  seo: real('seo'),
  /** Largest Contentful Paint (ms). */
  lcpMs: integer('lcp_ms'),
  /** Cumulative Layout Shift. */
  cls: real('cls'),
  /** Total Blocking Time (ms). */
  tbtMs: integer('tbt_ms'),
  /** Lighthouse version, e.g. "12.6.0". */
  lighthouseVersion: text('lighthouse_version'),
  reportSha256: text('report_sha256'),
});

export type LighthouseRun = typeof lighthouseRuns.$inferSelect;
export type NewLighthouseRun = typeof lighthouseRuns.$inferInsert;

// ---------------------------------------------------------------------------
// axe_runs — accessibility violations by impact level.
// ---------------------------------------------------------------------------

export const axeRuns = sqliteTable('axe_runs', {
  siteId: integer('site_id').notNull().primaryKey(),
  violationsTotal: integer('violations_total').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  seriousCount:  integer('serious_count').notNull().default(0),
  moderateCount: integer('moderate_count').notNull().default(0),
  minorCount:    integer('minor_count').notNull().default(0),
  /** Total nodes scanned by axe. */
  nodesScanned: integer('nodes_scanned'),
  axeVersion: text('axe_version'),
  reportSha256: text('report_sha256'),
});

export type AxeRun = typeof axeRuns.$inferSelect;
export type NewAxeRun = typeof axeRuns.$inferInsert;
