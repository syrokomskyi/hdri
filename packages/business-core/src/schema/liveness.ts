import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// liveness_checks — per-domain HTTP availability result, owner: site-liveness
// ---------------------------------------------------------------------------

export const livenessChecks = sqliteTable('liveness_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Mirrors sites.id from core.db — stored here for join convenience via ATTACH. */
  siteId: integer('site_id').notNull(),
  domain: text('domain').notNull(),
  checkedAt: integer('checked_at').notNull().default(sql`(unixepoch())`),
  /** HTTP status returned by the server (null if no response received). */
  httpStatus: integer('http_status'),
  /** Final URL after following redirects (null if no redirect). */
  finalUrl: text('final_url'),
  redirectCount: integer('redirect_count').notNull().default(0),
  latencyMs: integer('latency_ms'),
  /**
   * true  — server responded with HTTP < 500 (site is reachable even if it
   *         returns 4xx client errors).
   * false — network failure, timeout, SSL error, or 5xx.
   */
  isLive: integer('is_live', { mode: 'boolean' }).notNull().default(false),
  /**
   * Short error category: 'ENOTFOUND' | 'ECONNREFUSED' | 'ETIMEDOUT' |
   * 'SSL_ERROR' | 'REDIRECT_LOOP' | 'HTTP_5XX' | 'UNKNOWN'.
   * Null if isLive = true.
   */
  errorCode: text('error_code'),
  /** Raw error message (truncated to 500 chars). */
  errorMsg: text('error_msg'),
}, (t) => ({
  uniq: uniqueIndex('lc_site').on(t.siteId),
  liveIdx: index('lc_live_idx').on(t.isLive),
  domainIdx: index('lc_domain_idx').on(t.domain),
}));

export type LivenessCheck = typeof livenessChecks.$inferSelect;
export type NewLivenessCheck = typeof livenessChecks.$inferInsert;
