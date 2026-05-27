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
// site_pages — URL registry per site, owned by pages-YYYY.db
// ---------------------------------------------------------------------------

export const sitePages = sqliteTable('site_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  siteId: integer('site_id').notNull(),
  urlNorm: text('url_norm').notNull(),
  urlSha256: text('url_sha256').notNull(),
  urlNormalizerVer: text('url_normalizer_ver').notNull().default('v1'),
  source: text('source').notNull().default('homepage'),
  firstSeenAt: integer('first_seen_at').default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at').default(sql`(unixepoch())`),
}, (t) => ({
  uniq: uniqueIndex('sp_site_url').on(t.siteId, t.urlSha256),
  siteIdx: index('sp_site_idx').on(t.siteId),
  sourceIdx: index('sp_source_idx').on(t.source),
}));

export type SitePage = typeof sitePages.$inferSelect;
export type NewSitePage = typeof sitePages.$inferInsert;

// ---------------------------------------------------------------------------
// page_contents — CAS store for deduplicated page HTML, owner: site-profile
// ---------------------------------------------------------------------------

export const pageContents = sqliteTable('page_contents', {
  sha256: text('sha256').primaryKey(),
  storagePath: text('storage_path').notNull(),
  byteSize: integer('byte_size'),
  firstSeenAt: integer('first_seen_at').default(sql`(unixepoch())`),
});

export type PageContent = typeof pageContents.$inferSelect;
export type NewPageContent = typeof pageContents.$inferInsert;

// ---------------------------------------------------------------------------
// page_observations — tracks which pages were seen in which batch, owner: site-profile
// ---------------------------------------------------------------------------

export const pageObservations = sqliteTable('page_observations', {
  sitePageId: integer('site_page_id').notNull().primaryKey(),
  contentSha256: text('content_sha256').notNull(),
  isNewContent: integer('is_new_content', { mode: 'boolean' }).notNull(),
  observedAt: integer('observed_at').default(sql`(unixepoch())`),
}, (t) => ({
  contentIdx: index('po_content_idx').on(t.contentSha256),
}));

export type PageObservation = typeof pageObservations.$inferSelect;
export type NewPageObservation = typeof pageObservations.$inferInsert;

// ---------------------------------------------------------------------------
// content_extractions — LLM-extracted signals per content hash, owner: site-profile
// ---------------------------------------------------------------------------

export const contentExtractions = sqliteTable('content_extractions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentSha256: text('content_sha256').notNull(),
  extractorVer: text('extractor_ver').notNull(),
  promptSha: text('prompt_sha'),
  city: text('city'),
  cityConfidence: integer('city_confidence'),
  postalCode: text('postal_code'),
  postalCodeConfidence: integer('postal_code_confidence'),
  impressumPresent: integer('impressum_present'),
  impressumUrl: text('impressum_url'),
  impressumConfidence: integer('impressum_confidence'),
  datenschutzPresent: integer('datenschutz_present'),
  datenschutzUrl: text('datenschutz_url'),
  datenschutzConfidence: integer('datenschutz_confidence'),
  openingHoursText: text('opening_hours_text'),
  openingHoursConfidence: integer('opening_hours_confidence'),
  servicesJson: text('services_json'),
  cookieBannerPresent: integer('cookie_banner_present'),
  cookieBannerConfidence: integer('cookie_banner_confidence'),
  rawResultJson: text('raw_result_json'),
  extractedAt: integer('extracted_at').default(sql`(unixepoch())`),
}, (t) => ({
  uniq: uniqueIndex('ce_sha_ver').on(t.contentSha256, t.extractorVer),
}));

export type ContentExtraction = typeof contentExtractions.$inferSelect;
export type NewContentExtraction = typeof contentExtractions.$inferInsert;

// ---------------------------------------------------------------------------
// content_contacts — individual contact items from an extraction, owner: site-profile
// ---------------------------------------------------------------------------

export const contentContacts = sqliteTable('content_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  extractionId: integer('extraction_id').notNull(),
  kind: text('kind').notNull(),       // 'phone' | 'email' | 'whatsapp'
  valueNorm: text('value_norm').notNull(),
  valueRaw: text('value_raw'),
  confidence: integer('confidence'),
}, (t) => ({
  uniq: uniqueIndex('cc_extr_kind_val').on(t.extractionId, t.kind, t.valueNorm),
}));

export type ContentContact = typeof contentContacts.$inferSelect;
export type NewContentContact = typeof contentContacts.$inferInsert;

// ---------------------------------------------------------------------------
// ext_phone — phone number extractions per content hash, owner: site-profile
// ---------------------------------------------------------------------------

export const extPhone = sqliteTable('ext_phone', {
  contentSha256: text('content_sha256').notNull(),
  extractorVer: text('extractor_ver').notNull(),
  present: integer('present', { mode: 'boolean' }).notNull(),
  count: integer('count').notNull(),
  extractedAt: integer('extracted_at').default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.contentSha256, t.extractorVer] }),
}));

export type ExtPhone = typeof extPhone.$inferSelect;
export type NewExtPhone = typeof extPhone.$inferInsert;

// ---------------------------------------------------------------------------
// ext_email — email address extractions per content hash, owner: site-profile
// ---------------------------------------------------------------------------

export const extEmail = sqliteTable('ext_email', {
  contentSha256: text('content_sha256').notNull(),
  extractorVer: text('extractor_ver').notNull(),
  present: integer('present', { mode: 'boolean' }).notNull(),
  count: integer('count').notNull(),
  extractedAt: integer('extracted_at').default(sql`(unixepoch())`),
}, (t) => ({
  pk: primaryKey({ columns: [t.contentSha256, t.extractorVer] }),
}));

export type ExtEmail = typeof extEmail.$inferSelect;
export type NewExtEmail = typeof extEmail.$inferInsert;
