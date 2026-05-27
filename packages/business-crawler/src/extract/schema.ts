import { type CheerioAPI } from 'cheerio';
import { extractSchemaOrgTypes, type SimplePresenceResult } from './helpers.js';

/** Local business Schema.org types (LocalBusiness + major subtypes). */
const LOCAL_BUSINESS_TYPES = new Set([
  'localbusiness', 'store', 'restaurant', 'foodestablishment', 'lodgingbusiness',
  'healthandbeautybusiness', 'homeandconstructionbusiness', 'automotivebusiness',
  'entertainmentbusiness', 'financialservice', 'legalservice', 'medicalorganization',
  'professionalservice', 'realestateagent', 'recyclingcenter', 'selfstorageunit',
  'servicechannel', 'touristinformationcenter',
]);

export const extractSchemaLocalBusiness = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: [...types].some((t) => LOCAL_BUSINESS_TYPES.has(t)) };
};

export const extractSchemaService = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('service') };
};

export const extractSchemaFaq = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('faqpage') };
};

export const extractSchemaHowTo = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('howto') };
};

export const extractSchemaBreadcrumb = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('breadcrumblist') };
};

export const extractSchemaOpeningHoursSpec = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('openinghoursspecification') };
};

export const extractSchemaPerson = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('person') };
};

export const extractSchemaReview = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('review') || types.has('aggregaterating') };
};

export const extractSchemaProduct = (html: string | CheerioAPI): SimplePresenceResult => {
  const types = extractSchemaOrgTypes(html);
  return { present: types.has('product') };
};
