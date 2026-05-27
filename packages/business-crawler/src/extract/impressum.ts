import { type CheerioAPI } from 'cheerio';
import { findKeywordMatch, resolveUrl, resolveCheerio, type KeywordMatch } from './helpers.js';

export type ImpressumResult = {
  present: boolean;
  url: string | null;
  confidence: number | null;
};

const IMPRESSUM_KEYWORDS: KeywordMatch[] = [
  { keyword: 'impressum', confidence: 90 },
  { keyword: 'imprint', confidence: 90 },
  { keyword: 'legalnotice', confidence: 90 },
  { keyword: 'legaldisclosure', confidence: 90 },
  { keyword: 'anbieterkennzeichnung', confidence: 90 },
  { keyword: 'rechtlichehinweise', confidence: 90 },
  { keyword: 'sitenotice', confidence: 90 },
  { keyword: 'provideridentification', confidence: 90 },
  { keyword: 'legalinformation', confidence: 70 },
  { keyword: 'companyinformation', confidence: 70 },
  { keyword: 'verantwortlicher', confidence: 70 },
  { keyword: 'haftungsausschluss', confidence: 70 },
  { keyword: 'disclaimer', confidence: 60 },
  { keyword: 'legal', confidence: 50 },
];

/**
 * Detects an Impressum (legal notice) link on a page.
 *
 * @param html    Raw HTML string.
 * @param baseUrl Final URL of the page, used to resolve relative hrefs.
 */
export const extractImpressum = (html: string | CheerioAPI, baseUrl: string): ImpressumResult => {
  const $ = resolveCheerio(html);
  let url: string | null = null;
  let confidence: number | null = null;
  $('a[href]').each((_i, el) => {
    if (url) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, IMPRESSUM_KEYWORDS);
    if (match) {
      url = resolveUrl(href, baseUrl);
      confidence = match.confidence;
    }
  });
  return { present: url !== null, url, confidence };
};
