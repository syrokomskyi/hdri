/**
 * Mapping from legacy ext_* table names to canonical signal ontology paths.
 *
 * Each entry maps a source ext_ table to one or more signal paths, the
 * expected value type, and the column to read the value from.
 *
 * This table is the single source of truth for the ext_* → observations
 * bridge. Adding a new ext_ table to hdri-factory requires adding
 * exactly one entry here.
 */

import type { ObservationValueType } from './types.js';

export type ExtSignalMapping = {
  /** Name of the ext_ table in pages_YYYY.db */
  readonly table: string;
  /** Canonical signal path in the ontology */
  readonly signalPath: string;
  /** Expected observation value type */
  readonly valueType: ObservationValueType;
  /**
   * Column name in the ext_ table to read:
   * - 'present' for boolean signals (INTEGER 0/1)
   * - 'year' for ext_copyright_year (INTEGER)
   * - 'text' for ext_opening_hours (TEXT)
   */
  readonly column: string;
};

export type AxeSignalMapping = {
  /** Column name in axe_runs */
  readonly column: string;
  /** Canonical signal path in the ontology */
  readonly signalPath: string;
  /** Expected observation value type */
  readonly valueType: ObservationValueType;
};

/**
 * Complete mapping of ext_* tables to ontology signal paths.
 *
 * Groups:
 * - Legal page signals
 * - Privacy signals
 * - Content signals
 * - Structured data (Schema.org)
 * - Social platform signals
 * - External links / registries
 * - Trust signals
 */
export const EXT_SIGNAL_MAP: readonly ExtSignalMapping[] = [
  // -- Legal --
  { table: 'ext_impressum',      signalPath: 'legal.impressum.present',       valueType: 'bool', column: 'present' },
  { table: 'ext_datenschutz',    signalPath: 'legal.datenschutz.present',     valueType: 'bool', column: 'present' },
  { table: 'ext_agb_page',       signalPath: 'legal.agb.present',             valueType: 'bool', column: 'present' },
  { table: 'ext_bfsg_page',      signalPath: 'legal.bfsg.present',            valueType: 'bool', column: 'present' },
  { table: 'ext_widerruf_page',  signalPath: 'legal.widerruf.present',        valueType: 'bool', column: 'present' },
  { table: 'ext_versand_page',   signalPath: 'legal.versand.present',         valueType: 'bool', column: 'present' },

  // -- Privacy --
  // Legacy bool signal — kept for backwards compatibility with old codebooks.
  // Marked deprecated_in v1.0.0 of the ontology in favour of privacy.consent.quality.
  { table: 'ext_cookie_banner',  signalPath: 'privacy.consent.banner.present', valueType: 'bool', column: 'present' },
  // Observatory-grade enum signal: 5-level cookie consent quality.
  // Reads the `quality` column populated by extractCookieBanner v1.1+.
  { table: 'ext_cookie_banner',  signalPath: 'privacy.consent.quality',        valueType: 'str',  column: 'quality' },

  // -- Content --
  { table: 'ext_opening_hours',  signalPath: 'content.opening_hours.present', valueType: 'bool', column: 'text' },
  { table: 'ext_copyright_year', signalPath: 'content.copyright.year',        valueType: 'num',  column: 'year' },
  { table: 'ext_contact_form',   signalPath: 'contact.form.present',          valueType: 'bool', column: 'present' },
  { table: 'ext_portfolio',      signalPath: 'content.portfolio.present',     valueType: 'bool', column: 'present' },
  { table: 'ext_map',            signalPath: 'content.map.present',           valueType: 'bool', column: 'present' },
  { table: 'ext_team_page',      signalPath: 'content.team_page.present',     valueType: 'bool', column: 'present' },
  { table: 'ext_testimonials',   signalPath: 'content.testimonials.present',  valueType: 'bool', column: 'present' },
  { table: 'ext_case_studies',   signalPath: 'content.case_studies.present',  valueType: 'bool', column: 'present' },

  // -- Schema.org --
  { table: 'ext_schema_local_business',      signalPath: 'structured_data.schema_org.local_business.present',      valueType: 'bool', column: 'present' },
  { table: 'ext_schema_service',             signalPath: 'structured_data.schema_org.service.present',             valueType: 'bool', column: 'present' },
  { table: 'ext_schema_faq',                 signalPath: 'structured_data.schema_org.faq.present',                 valueType: 'bool', column: 'present' },
  { table: 'ext_schema_how_to',              signalPath: 'structured_data.schema_org.how_to.present',              valueType: 'bool', column: 'present' },
  { table: 'ext_schema_breadcrumb',          signalPath: 'structured_data.schema_org.breadcrumb.present',          valueType: 'bool', column: 'present' },
  { table: 'ext_schema_opening_hours_spec',  signalPath: 'structured_data.schema_org.opening_hours_spec.present',  valueType: 'bool', column: 'present' },
  { table: 'ext_schema_person',              signalPath: 'structured_data.schema_org.person.present',              valueType: 'bool', column: 'present' },
  { table: 'ext_schema_review',              signalPath: 'structured_data.schema_org.review.present',              valueType: 'bool', column: 'present' },
  { table: 'ext_schema_product',             signalPath: 'structured_data.schema_org.product.present',             valueType: 'bool', column: 'present' },

  // -- Social --
  { table: 'ext_social_facebook',  signalPath: 'social.facebook.present',  valueType: 'bool', column: 'present' },
  { table: 'ext_social_instagram', signalPath: 'social.instagram.present', valueType: 'bool', column: 'present' },
  { table: 'ext_social_youtube',   signalPath: 'social.youtube.present',   valueType: 'bool', column: 'present' },
  { table: 'ext_social_linkedin',  signalPath: 'social.linkedin.present',  valueType: 'bool', column: 'present' },
  { table: 'ext_social_tiktok',    signalPath: 'social.tiktok.present',    valueType: 'bool', column: 'present' },
  { table: 'ext_social_whatsapp',  signalPath: 'social.whatsapp.present',  valueType: 'bool', column: 'present' },
  { table: 'ext_social_xing',      signalPath: 'social.xing.present',      valueType: 'bool', column: 'present' },
  { table: 'ext_social_pinterest', signalPath: 'social.pinterest.present', valueType: 'bool', column: 'present' },
  { table: 'ext_social_twitter',   signalPath: 'social.twitter.present',   valueType: 'bool', column: 'present' },

  // -- External links / registries --
  { table: 'ext_link_handelsregister',      signalPath: 'registry.handelsregister.present',      valueType: 'bool', column: 'present' },
  { table: 'ext_link_unternehmensregister', signalPath: 'registry.unternehmensregister.present', valueType: 'bool', column: 'present' },
  { table: 'ext_link_kammern',              signalPath: 'registry.kammern.present',              valueType: 'bool', column: 'present' },
  { table: 'ext_link_industry_catalogs',    signalPath: 'registry.industry_catalogs.present',    valueType: 'bool', column: 'present' },
  { table: 'ext_link_google_business',      signalPath: 'registry.google_business.present',      valueType: 'bool', column: 'present' },

  // -- Trust --
  { table: 'ext_certifications', signalPath: 'trust.certifications.present', valueType: 'bool', column: 'present' },
  { table: 'ext_awards',        signalPath: 'trust.awards.present',         valueType: 'bool', column: 'present' },
  { table: 'ext_memberships',   signalPath: 'trust.memberships.present',    valueType: 'bool', column: 'present' },
  { table: 'ext_meister',       signalPath: 'trust.certification.meister.present', valueType: 'bool', column: 'present' },
] as const;

export const AXE_SIGNAL_MAP: readonly AxeSignalMapping[] = [
  { column: 'violations_total', signalPath: 'audit.axe.violations.total.count', valueType: 'num' },
  { column: 'critical_count',   signalPath: 'audit.axe.violations.critical.count', valueType: 'num' },
  { column: 'serious_count',    signalPath: 'audit.axe.violations.serious.count', valueType: 'num' },
  { column: 'moderate_count',   signalPath: 'audit.axe.violations.moderate.count', valueType: 'num' },
  { column: 'minor_count',      signalPath: 'audit.axe.violations.minor.count', valueType: 'num' },
  { column: 'nodes_scanned',    signalPath: 'audit.axe.nodes_scanned.count', valueType: 'num' },
] as const;

/**
 * Lookup by ext_ table name. Returns the list of mappings for that table —
 * a single ext_ table may produce multiple ontology signals (e.g.
 * `ext_cookie_banner` produces both `privacy.consent.banner.present` and
 * `privacy.consent.quality`).
 */
export const extSignalsByTable: ReadonlyMap<string, readonly ExtSignalMapping[]> = (() => {
  const m = new Map<string, ExtSignalMapping[]>();
  for (const mapping of EXT_SIGNAL_MAP) {
    const list = m.get(mapping.table);
    if (list) list.push(mapping);
    else m.set(mapping.table, [mapping]);
  }
  return m;
})();

/** Lookup by signal_path. Each signal path maps to exactly one ExtSignalMapping. */
export const extSignalByPath: ReadonlyMap<string, ExtSignalMapping> = new Map(
  EXT_SIGNAL_MAP.map((m) => [m.signalPath, m]),
);

export const axeSignalByPath: ReadonlyMap<string, AxeSignalMapping> = new Map(
  AXE_SIGNAL_MAP.map((m) => [m.signalPath, m]),
);
