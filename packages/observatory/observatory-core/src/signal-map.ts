/*
<MODULE_CONTRACT>
<purpose>Maps legacy ext_* table names to canonical signal ontology paths, defining expected value types and source columns. Provides createSignalMap for runtime validation of map entries against a loaded ontology.</purpose>
<non-goals>
  <item>Does not handle the extraction of data from databases.</item>
  <item>Does not perform any data transformation or validation beyond mapping.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of ext_* to signal path mapping with predefined mappings.</item>
  <item>Add createSignalMap function that validates map entries against a loaded ontology at construction time, enforcing referential integrity fail-fast.</item>
</CHANGE_SUMMARY>
*/

/**
 * Mapping from legacy ext_* table names to canonical signal ontology paths.
 *
 * Each entry maps a source ext_ table to one or more signal paths, the
 * expected value type, and the column to read the value from.
 *
 * This table is the single source of truth for the ext_* → observations
 * bridge. Adding a new ext_ table to factory requires adding
 * exactly one entry here.
 */

import type { ObservationValueType } from "./types.js";
import type { SignalOntology } from "./ontology/types.js";

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
 * Data-driven from the SIGNAL_MAP_DATA constant. Adding a new ext_ table
 * requires adding exactly one entry to the array below.
 */
const SIGNAL_MAP_DATA = {
  ext_signals: [
    {
      table: "ext_impressum",
      signalPath: "legal.impressum.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_datenschutz",
      signalPath: "legal.datenschutz.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_agb_page",
      signalPath: "legal.agb.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_bfsg_page",
      signalPath: "legal.bfsg.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_widerruf_page",
      signalPath: "legal.widerruf.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_versand_page",
      signalPath: "legal.versand.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_cookie_banner",
      signalPath: "privacy.consent.banner.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_cookie_banner",
      signalPath: "privacy.consent.quality",
      valueType: "str",
      column: "quality",
    },
    {
      table: "ext_opening_hours",
      signalPath: "content.opening_hours.present",
      valueType: "bool",
      column: "text",
    },
    {
      table: "ext_copyright_year",
      signalPath: "content.copyright.year",
      valueType: "num",
      column: "year",
    },
    {
      table: "ext_contact_form",
      signalPath: "contact.form.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_portfolio",
      signalPath: "content.portfolio.present",
      valueType: "bool",
      column: "present",
    },
    { table: "ext_map", signalPath: "content.map.present", valueType: "bool", column: "present" },
    {
      table: "ext_team_page",
      signalPath: "content.team_page.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_testimonials",
      signalPath: "content.testimonials.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_case_studies",
      signalPath: "content.case_studies.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_local_business",
      signalPath: "structured_data.schema_org.local_business.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_service",
      signalPath: "structured_data.schema_org.service.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_faq",
      signalPath: "structured_data.schema_org.faq.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_how_to",
      signalPath: "structured_data.schema_org.how_to.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_breadcrumb",
      signalPath: "structured_data.schema_org.breadcrumb.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_opening_hours_spec",
      signalPath: "structured_data.schema_org.opening_hours_spec.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_person",
      signalPath: "structured_data.schema_org.person.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_review",
      signalPath: "structured_data.schema_org.review.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_schema_product",
      signalPath: "structured_data.schema_org.product.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_facebook",
      signalPath: "social.facebook.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_instagram",
      signalPath: "social.instagram.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_youtube",
      signalPath: "social.youtube.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_linkedin",
      signalPath: "social.linkedin.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_tiktok",
      signalPath: "social.tiktok.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_whatsapp",
      signalPath: "social.whatsapp.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_xing",
      signalPath: "social.xing.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_pinterest",
      signalPath: "social.pinterest.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_social_twitter",
      signalPath: "social.twitter.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_link_handelsregister",
      signalPath: "registry.handelsregister.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_link_unternehmensregister",
      signalPath: "registry.unternehmensregister.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_link_kammern",
      signalPath: "registry.kammern.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_link_industry_catalogs",
      signalPath: "registry.industry_catalogs.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_link_google_business",
      signalPath: "registry.google_business.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_certifications",
      signalPath: "trust.certifications.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_awards",
      signalPath: "trust.awards.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_memberships",
      signalPath: "trust.memberships.present",
      valueType: "bool",
      column: "present",
    },
    {
      table: "ext_meister",
      signalPath: "trust.certification.meister.present",
      valueType: "bool",
      column: "present",
    },
  ] as const,
  axe_signals: [
    {
      column: "violations_total",
      signalPath: "audit.axe.violations.total.count",
      valueType: "num",
    },
    {
      column: "critical_count",
      signalPath: "audit.axe.violations.critical.count",
      valueType: "num",
    },
    { column: "serious_count", signalPath: "audit.axe.violations.serious.count", valueType: "num" },
    {
      column: "moderate_count",
      signalPath: "audit.axe.violations.moderate.count",
      valueType: "num",
    },
    { column: "minor_count", signalPath: "audit.axe.violations.minor.count", valueType: "num" },
    { column: "nodes_scanned", signalPath: "audit.axe.nodes_scanned.count", valueType: "num" },
  ] as const,
} as const;

export const EXT_SIGNAL_MAP: readonly ExtSignalMapping[] = SIGNAL_MAP_DATA.ext_signals;
export const AXE_SIGNAL_MAP: readonly AxeSignalMapping[] = SIGNAL_MAP_DATA.axe_signals;

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

// ---------------------------------------------------------------------------
// Validated signal map (construction-time referential integrity)
// ---------------------------------------------------------------------------

export type SignalMapIssue = {
  readonly signalPath: string;
  readonly code: "unknown_signal" | "value_type_mismatch";
  readonly message: string;
};

export type SignalMap = {
  readonly extByTable: ReadonlyMap<string, readonly ExtSignalMapping[]>;
  readonly extByPath: ReadonlyMap<string, ExtSignalMapping>;
  readonly axeByPath: ReadonlyMap<string, AxeSignalMapping>;
};

/**
 * Validates every signal path in EXT_SIGNAL_MAP and AXE_SIGNAL_MAP against the
 * loaded ontology. Throws on the first unknown signal path or value type
 * mismatch, so callers fail fast at pipeline startup instead of silently
 * producing unscorable observations.
 *
 * Returns a SignalMap with the same lookup indexes as the static exports,
 * but guaranteed to be consistent with the ontology.
 */
export function createSignalMap(ontology: SignalOntology): SignalMap {
  const issues: SignalMapIssue[] = [];

  for (const mapping of EXT_SIGNAL_MAP) {
    const def = ontology.signals[mapping.signalPath];
    if (!def) {
      issues.push({
        signalPath: mapping.signalPath,
        code: "unknown_signal",
        message: `Signal path "${mapping.signalPath}" (table ${mapping.table}) is not in ontology v${ontology.version}`,
      });
      continue;
    }
    if (def.value_type !== mapping.valueType) {
      issues.push({
        signalPath: mapping.signalPath,
        code: "value_type_mismatch",
        message: `Signal "${mapping.signalPath}": map has value_type "${mapping.valueType}", ontology has "${def.value_type}"`,
      });
    }
  }

  for (const mapping of AXE_SIGNAL_MAP) {
    const def = ontology.signals[mapping.signalPath];
    if (!def) {
      issues.push({
        signalPath: mapping.signalPath,
        code: "unknown_signal",
        message: `Signal path "${mapping.signalPath}" (axe column ${mapping.column}) is not in ontology v${ontology.version}`,
      });
      continue;
    }
    if (def.value_type !== mapping.valueType) {
      issues.push({
        signalPath: mapping.signalPath,
        code: "value_type_mismatch",
        message: `Signal "${mapping.signalPath}": map has value_type "${mapping.valueType}", ontology has "${def.value_type}"`,
      });
    }
  }

  if (issues.length > 0) {
    const detail = issues.map((i) => `  [${i.code}] ${i.message}`).join("\n");
    throw new Error(
      `createSignalMap: ${issues.length} issue(s) found against ontology v${ontology.version}:\n${detail}`,
    );
  }

  return {
    extByTable: extSignalsByTable,
    extByPath: extSignalByPath,
    axeByPath: axeSignalByPath,
  };
}
