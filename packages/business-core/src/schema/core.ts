import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// sites — canonical domain registry, owner: catalog-harvest
// ---------------------------------------------------------------------------

export const sites = sqliteTable('sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domain: text('domain').notNull().unique(),
  hwoUid: text('hwo_uid'),
  hwoConfidence: integer('hwo_confidence'),
  hwoProvenance: text('hwo_provenance'),
  bundesland: text('bundesland'),
  gemeinde: text('gemeinde'),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  domainIdx: uniqueIndex('sites_domain_idx').on(t.domain),
  hwoUidIdx: index('sites_hwo_uid_idx').on(t.hwoUid),
}));

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

// ---------------------------------------------------------------------------
// site_source_seeds — raw catalog entries linked to a site, owner: catalog-harvest
// ---------------------------------------------------------------------------

export const siteSourceSeeds = sqliteTable('site_source_seeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: integer('site_id').notNull(),
  /** Batch-scoped source path, e.g. "2026-04/firmenabc.com/bw.csv". */
  sourcePath: text('source_path').notNull(),
  sourceItemKey: text('source_item_key').notNull(),
  businessName: text('business_name'),
  streetAddress: text('street_address'),
  postalCode: text('postal_code'),
  city: text('city'),
  phone: text('phone'),
  email: text('email'),
  websiteUrl: text('website_url'),
  category: text('category'),
  sourceProfileUrl: text('source_profile_url'),
  rawJson: text('raw_json').notNull(),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  uniq: uniqueIndex('sss_site_source_item').on(
    t.siteId, t.sourcePath, t.sourceItemKey,
  ),
  siteIdx: index('sss_site_idx').on(t.siteId),
  sourceIdx: index('sss_source_idx').on(t.sourcePath),
}));

export type SiteSourceSeed = typeof siteSourceSeeds.$inferSelect;
export type NewSiteSourceSeed = typeof siteSourceSeeds.$inferInsert;

// ---------------------------------------------------------------------------
// site_pages — URL registry per site, owned by pages-YYYY.db (3-extract-profile).
// Not defined here — see packages/business-core/src/migrate/pages.ts.
// This table was removed from core_2026.db as it was always empty (0 rows).
// Downstream pipelines query site_pages from pages-YYYY.db directly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// site_cohorts — named cohorts for Jahresbericht, owner: hdri-scoring
// ---------------------------------------------------------------------------

export const siteCohorts = sqliteTable('site_cohorts', {
  id: text('id').primaryKey(),            // e.g. 'jb-2026-2027'
  description: text('description'),
  ownerApp: text('owner_app').notNull(),
  codebookVersion: text('codebook_version'),
  randomSeed: text('random_seed').notNull(),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
});

export type SiteCohort = typeof siteCohorts.$inferSelect;
export type NewSiteCohort = typeof siteCohorts.$inferInsert;

// ---------------------------------------------------------------------------
// site_strata — cohort membership with stratification labels, owner: hdri-scoring
// ---------------------------------------------------------------------------

export const siteStrata = sqliteTable('site_strata', {
  cohortId: text('cohort_id').notNull(),
  siteId: integer('site_id').notNull(),
  strataSystem: text('strata_system').notNull().default('destatis_group'),
  strataCode: text('strata_code').notNull(),
  bundesland: text('bundesland'),
  settlementType: text('settlement_type'),  // 'grossstadt' | 'mittelstadt' | 'landkreis'
}, (t) => ({
  pk: primaryKey({ columns: [t.cohortId, t.siteId] }),
  cohortIdx: index('ss_cohort_idx').on(t.cohortId),
  strataIdx: index('ss_strata_idx').on(t.cohortId, t.strataSystem, t.strataCode),
}));

export type SiteStratum = typeof siteStrata.$inferSelect;
export type NewSiteStratum = typeof siteStrata.$inferInsert;

// ---------------------------------------------------------------------------
// consent_events — DSGVO audit log for all data-subject interactions.
//
// Records whenever a data-subject (site operator) explicitly consents to or
// withdraws from data collection, score display, or self-report submission.
// Owner: any app that needs to record consent events; all apps may read.
// (Historical: previously owned by the self-report-intake server, now removed.)
// ---------------------------------------------------------------------------

export const consentEvents = sqliteTable('consent_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /**
   * Pseudonymous identifier for the data-subject session.
   * Must NOT contain the real domain or personal data — use a HMAC-SHA256
   * of (domain + daily secret) so consent can be revoked by domain
   * without exposing PII in the log.
   */
  subjectToken: text('subject_token').notNull(),
  /**
   * Type of consent event:
   *   'grant'    — data-subject opted in
   *   'withdraw' — data-subject revoked consent (triggers deletion workflow)
   *   'update'   — data-subject updated their scope selection
   */
  eventType: text('event_type', { enum: ['grant', 'withdraw', 'update'] }).notNull(),
  /**
   * Scope of consent granted/withdrawn (JSON array of strings).
   * Example: '["crawl","score","publish"]'
   */
  scopeJson: text('scope_json').notNull().default('[]'),
  /** IP address hash (SHA-256 of IP + daily salt) — never the raw IP. */
  ipHashSha256: text('ip_hash_sha256'),
  /** User-agent string (trimmed to 200 chars, no hashing needed). */
  userAgent: text('user_agent'),
  /** ISO 3166-1 alpha-2 country inferred from IP geolocation (2 chars). */
  countryCode: text('country_code'),
  recordedAt: integer('recorded_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  tokenIdx: index('ce_token_idx').on(t.subjectToken),
  typeIdx: index('ce_type_idx').on(t.eventType),
  timeIdx: index('ce_time_idx').on(t.recordedAt),
}));

export type ConsentEvent = typeof consentEvents.$inferSelect;
export type NewConsentEvent = typeof consentEvents.$inferInsert;

// ---------------------------------------------------------------------------
// site_hwo_mappings — normalized storage for HWO mapping results
// Owner: any app that writes mapping results; all apps may read.
// ---------------------------------------------------------------------------

export const siteHwoMappings = sqliteTable('site_hwo_mappings', {
  siteId: integer('site_id').notNull(),
  mappingSystem: text('mapping_system').notNull(),
  targetCode: text('target_code').notNull(),
  targetLabel: text('target_label'),
  source: text('source').notNull(),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.siteId, t.mappingSystem] }),
  systemIdx: index('shm_system_idx').on(t.mappingSystem, t.targetCode),
  siteIdx: index('shm_site_idx').on(t.siteId),
}));

export type SiteHwoMapping = typeof siteHwoMappings.$inferSelect;
export type NewSiteHwoMapping = typeof siteHwoMappings.$inferInsert;
