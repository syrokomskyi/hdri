import { type CheerioAPI } from 'cheerio';
import { findKeywordMatch, resolveUrl, resolveCheerio, type KeywordMatch, type LinkPresenceResult } from './helpers.js';

const BFSG_KEYWORDS: KeywordMatch[] = [
  { keyword: 'barrierefreiheit', confidence: 90 },
  { keyword: 'barrierefreiheitserklarung', confidence: 90 },
  { keyword: 'barrierefreiheitserklaerung', confidence: 90 },
  { keyword: 'bfsg', confidence: 90 },
  { keyword: 'accessibility-statement', confidence: 90 },
  { keyword: 'accessibilitystatement', confidence: 90 },
  { keyword: 'barrierefreiheitshinweise', confidence: 80 },
  { keyword: 'accessible', confidence: 50 },
];

const AGB_KEYWORDS: KeywordMatch[] = [
  { keyword: 'agb', confidence: 90 },
  { keyword: 'allgemeine-geschaftsbedingungen', confidence: 90 },
  { keyword: 'allgemeinegeschaftsbedingungen', confidence: 90 },
  { keyword: 'allgemeine-geschaeftsbedingungen', confidence: 90 },
  { keyword: 'nutzungsbedingungen', confidence: 90 },
  { keyword: 'geschaftsbedingungen', confidence: 90 },
  { keyword: 'terms-and-conditions', confidence: 80 },
  { keyword: 'termsandconditions', confidence: 80 },
  { keyword: 'terms-of-service', confidence: 80 },
  { keyword: 'termsofservice', confidence: 80 },
  { keyword: 'terms', confidence: 50 },
];

const WIDERRUF_KEYWORDS: KeywordMatch[] = [
  { keyword: 'widerruf', confidence: 90 },
  { keyword: 'widerrufsrecht', confidence: 90 },
  { keyword: 'widerrufsbelehrung', confidence: 90 },
  { keyword: 'widerrufsformular', confidence: 90 },
  { keyword: 'right-of-withdrawal', confidence: 80 },
  { keyword: 'rightofwithdrawal', confidence: 80 },
  { keyword: 'cancellation-policy', confidence: 80 },
  { keyword: 'cancellationpolicy', confidence: 80 },
  { keyword: 'cancellation', confidence: 50 },
];

const VERSAND_KEYWORDS: KeywordMatch[] = [
  { keyword: 'versand', confidence: 90 },
  { keyword: 'versandkosten', confidence: 90 },
  { keyword: 'lieferbedingungen', confidence: 90 },
  { keyword: 'lieferung', confidence: 80 },
  { keyword: 'versandinformationen', confidence: 80 },
  { keyword: 'shipping-and-delivery', confidence: 80 },
  { keyword: 'shippinganddelivery', confidence: 80 },
  { keyword: 'shipping', confidence: 60 },
  { keyword: 'delivery', confidence: 60 },
];

const extractLegalLink = (
  html: string | CheerioAPI,
  baseUrl: string,
  keywords: KeywordMatch[],
): LinkPresenceResult => {
  const $ = resolveCheerio(html);
  let url: string | null = null;
  let confidence: number | null = null;
  $('a[href]').each((_i, el) => {
    if (url) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, keywords);
    if (match) { url = resolveUrl(href, baseUrl); confidence = match.confidence; }
  });
  return { present: url !== null, url, confidence };
};

export const extractBfsgPage    = (html: string | CheerioAPI, baseUrl: string): LinkPresenceResult =>
  extractLegalLink(html, baseUrl, BFSG_KEYWORDS);

export const extractAgbPage     = (html: string | CheerioAPI, baseUrl: string): LinkPresenceResult =>
  extractLegalLink(html, baseUrl, AGB_KEYWORDS);

export const extractWiderrufPage = (html: string | CheerioAPI, baseUrl: string): LinkPresenceResult =>
  extractLegalLink(html, baseUrl, WIDERRUF_KEYWORDS);

export const extractVersandPage  = (html: string | CheerioAPI, baseUrl: string): LinkPresenceResult =>
  extractLegalLink(html, baseUrl, VERSAND_KEYWORDS);
