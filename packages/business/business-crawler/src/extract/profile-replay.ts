/*
<MODULE_CONTRACT>
  <purpose>Replay non-PII profile signal extraction from retained HTML using one DOM and an explicit historical year.</purpose>
  <non-goals><item>Does not fetch pages, authenticate source bytes, or assign asset ownership.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Provide an explicit replay registry for verifying retained profile projections.</item></CHANGE_SUMMARY>
*/

import { resolveCheerio } from "./helpers.js";
import { extractImpressum } from "./impressum.js";
import { extractDatenschutz } from "./datenschutz.js";
import { extractCookieBanner } from "./cookie-banner.js";
import { extractOpeningHours } from "./opening-hours.js";
import { extractCopyrightYear } from "./copyright-year.js";
import * as schema from "./schema.js";
import * as legal from "./legal.js";
import * as content from "./content.js";
import * as links from "./links.js";
import * as social from "./social.js";
import type { CheerioAPI } from "cheerio";

export type ProfileReplayValue = {
  present?: boolean;
  text?: string | null;
  year?: number | null;
  quality?: string | null;
};
type Extractor = ($: CheerioAPI, baseUrl: string, referenceYear: number) => ProfileReplayValue;
const extractors: Readonly<Record<string, Extractor>> = {
  ext_impressum: extractImpressum,
  ext_datenschutz: extractDatenschutz,
  ext_cookie_banner: extractCookieBanner,
  ext_opening_hours: extractOpeningHours,
  ext_copyright_year: ($, _url, year) => extractCopyrightYear($, year),
  ext_agb_page: legal.extractAgbPage,
  ext_bfsg_page: legal.extractBfsgPage,
  ext_widerruf_page: legal.extractWiderrufPage,
  ext_versand_page: legal.extractVersandPage,
  ext_contact_form: content.extractContactForm,
  ext_portfolio: content.extractPortfolio,
  ext_map: content.extractMap,
  ext_team_page: content.extractTeamPage,
  ext_testimonials: content.extractTestimonials,
  ext_case_studies: content.extractCaseStudies,
  ext_certifications: content.extractCertifications,
  ext_awards: content.extractAwards,
  ext_memberships: content.extractMemberships,
  ext_meister: content.extractMeister,
  ext_schema_local_business: schema.extractSchemaLocalBusiness,
  ext_schema_service: schema.extractSchemaService,
  ext_schema_faq: schema.extractSchemaFaq,
  ext_schema_how_to: schema.extractSchemaHowTo,
  ext_schema_breadcrumb: schema.extractSchemaBreadcrumb,
  ext_schema_opening_hours_spec: schema.extractSchemaOpeningHoursSpec,
  ext_schema_person: schema.extractSchemaPerson,
  ext_schema_review: schema.extractSchemaReview,
  ext_schema_product: schema.extractSchemaProduct,
  ext_social_facebook: social.extractSocialFacebook,
  ext_social_instagram: social.extractSocialInstagram,
  ext_social_youtube: social.extractSocialYoutube,
  ext_social_linkedin: social.extractSocialLinkedin,
  ext_social_tiktok: social.extractSocialTiktok,
  ext_social_whatsapp: social.extractSocialWhatsapp,
  ext_social_xing: social.extractSocialXing,
  ext_social_pinterest: social.extractSocialPinterest,
  ext_social_twitter: social.extractSocialTwitter,
  ext_link_handelsregister: links.extractLinkHandelsregister,
  ext_link_unternehmensregister: links.extractLinkUnternehmensregister,
  ext_link_kammern: links.extractLinkKammern,
  ext_link_industry_catalogs: links.extractLinkIndustryCatalogs,
  ext_link_google_business: links.extractLinkGoogleBusiness,
};

export function replayProfileSignals(
  html: string,
  baseUrl: string,
  referenceYear: number,
  tables: readonly string[],
): Record<string, ProfileReplayValue> {
  const $ = resolveCheerio(html);
  return Object.fromEntries(
    [...new Set(tables)].map((table) => {
      const extractor = Object.hasOwn(extractors, table) ? extractors[table] : undefined;
      if (!extractor) throw new Error(`Unsupported profile replay table: ${table}`);
      const result = extractor($, baseUrl, referenceYear);
      // Keep only bridge-consumed values; do not retain DOMs, URLs, contacts or incidental evidence.
      return [
        table,
        { present: result.present, text: result.text, year: result.year, quality: result.quality },
      ];
    }),
  );
}
