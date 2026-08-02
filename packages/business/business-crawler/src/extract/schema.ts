/*
<MODULE_CONTRACT>
<purpose>This module provides functions to extract and check the presence of specific Schema.org types from HTML content, focusing on types relevant to local businesses and services.</purpose>
<non-goals>
  <item>This module does not parse or validate the HTML structure itself.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of functions to detect various Schema.org types.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "cheerio";
import { extractSchemaOrgTypes, type SimplePresenceResult } from "./helpers.js";

/** Local business Schema.org types (LocalBusiness + major subtypes). */
const LOCAL_BUSINESS_TYPES = new Set([
  "localbusiness",
  "store",
  "restaurant",
  "foodestablishment",
  "lodgingbusiness",
  "healthandbeautybusiness",
  "homeandconstructionbusiness",
  "automotivebusiness",
  "entertainmentbusiness",
  "financialservice",
  "legalservice",
  "medicalorganization",
  "professionalservice",
  "realestateagent",
  "recyclingcenter",
  "selfstorageunit",
  "servicechannel",
  "touristinformationcenter",
]);

const makeSchemaExtractor =
  (check: (types: Set<string>) => boolean) =>
  (html: string | CheerioAPI): SimplePresenceResult => {
    const types = extractSchemaOrgTypes(html);
    return { present: check(types) };
  };

export const extractSchemaLocalBusiness = makeSchemaExtractor((types) =>
  [...types].some((t) => LOCAL_BUSINESS_TYPES.has(t)),
);
export const extractSchemaService = makeSchemaExtractor((types) => types.has("service"));
export const extractSchemaFaq = makeSchemaExtractor((types) => types.has("faqpage"));
export const extractSchemaHowTo = makeSchemaExtractor((types) => types.has("howto"));
export const extractSchemaBreadcrumb = makeSchemaExtractor((types) => types.has("breadcrumblist"));
export const extractSchemaOpeningHoursSpec = makeSchemaExtractor((types) =>
  types.has("openinghoursspecification"),
);
export const extractSchemaPerson = makeSchemaExtractor((types) => types.has("person"));
export const extractSchemaReview = makeSchemaExtractor(
  (types) => types.has("review") || types.has("aggregaterating"),
);
export const extractSchemaProduct = makeSchemaExtractor((types) => types.has("product"));
