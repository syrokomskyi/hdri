import { type CheerioAPI } from 'cheerio';
import { findKeywordMatch, resolveUrl, resolveCheerio, type KeywordMatch } from './helpers.js';

export type DatenschutzResult = {
  present: boolean;
  url: string | null;
  confidence: number | null;
};

const DATENSCHUTZ_KEYWORDS: KeywordMatch[] = [
  { keyword: 'datenschutz', confidence: 90 },
  { keyword: 'datenschutzerklaerung', confidence: 90 },
  { keyword: 'datenschutzhinweise', confidence: 90 },
  { keyword: 'datenschutzbestimmungen', confidence: 90 },
  { keyword: 'datenschutzrichtlinie', confidence: 90 },
  { keyword: 'privacy', confidence: 90 },
  { keyword: 'privacypolicy', confidence: 90 },
  { keyword: 'privacynotice', confidence: 90 },
  { keyword: 'privacystatement', confidence: 90 },
  { keyword: 'dataprotection', confidence: 90 },
  { keyword: 'gdpr', confidence: 90 },
  { keyword: 'dsgvo', confidence: 90 },
  { keyword: 'cookiepolicy', confidence: 70 },
  { keyword: 'cookienotice', confidence: 70 },
  { keyword: 'cookierichtlinie', confidence: 70 },
  { keyword: 'cookiehinweis', confidence: 70 },
  { keyword: 'cookieeinstellungen', confidence: 70 },
  { keyword: 'privatsphaere', confidence: 70 },
  { keyword: 'confidentiality', confidence: 70 },
  { keyword: 'personaldata', confidence: 70 },
  { keyword: 'cookie', confidence: 50 },
];

/**
 * Detects a Datenschutz (privacy policy) link on a page.
 *
 * @param html    Raw HTML string.
 * @param baseUrl Final URL of the page, used to resolve relative hrefs.
 */
export const extractDatenschutz = (html: string | CheerioAPI, baseUrl: string): DatenschutzResult => {
  const $ = resolveCheerio(html);
  let url: string | null = null;
  let confidence: number | null = null;
  $('a[href]').each((_i, el) => {
    if (url) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, DATENSCHUTZ_KEYWORDS);
    if (match) {
      url = resolveUrl(href, baseUrl);
      confidence = match.confidence;
    }
  });
  return { present: url !== null, url, confidence };
};
