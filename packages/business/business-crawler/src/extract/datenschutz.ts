/*
<MODULE_CONTRACT>
<purpose>This module detects and extracts Datenschutz (privacy policy) links from a webpage using specific keywords.</purpose>
<non-goals>
  <item>This module does not handle the parsing of non-HTML content or non-anchor elements.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of Datenschutz link extraction using keyword matching.</item>
</CHANGE_SUMMARY>
*/

import type { CheerioAPI } from "cheerio";
import { type KeywordMatch, type LinkPresenceResult } from "./helpers.js";
import { extractLegalLink } from "./legal.js";

export type DatenschutzResult = LinkPresenceResult;

const DATENSCHUTZ_KEYWORDS: KeywordMatch[] = [
  { keyword: "datenschutz", confidence: 90 },
  { keyword: "datenschutzerklaerung", confidence: 90 },
  { keyword: "datenschutzhinweise", confidence: 90 },
  { keyword: "datenschutzbestimmungen", confidence: 90 },
  { keyword: "datenschutzrichtlinie", confidence: 90 },
  { keyword: "privacy", confidence: 90 },
  { keyword: "privacypolicy", confidence: 90 },
  { keyword: "privacynotice", confidence: 90 },
  { keyword: "privacystatement", confidence: 90 },
  { keyword: "dataprotection", confidence: 90 },
  { keyword: "gdpr", confidence: 90 },
  { keyword: "dsgvo", confidence: 90 },
  { keyword: "cookiepolicy", confidence: 70 },
  { keyword: "cookienotice", confidence: 70 },
  { keyword: "cookierichtlinie", confidence: 70 },
  { keyword: "cookiehinweis", confidence: 70 },
  { keyword: "cookieeinstellungen", confidence: 70 },
  { keyword: "privatsphaere", confidence: 70 },
  { keyword: "confidentiality", confidence: 70 },
  { keyword: "personaldata", confidence: 70 },
  { keyword: "cookie", confidence: 50 },
];

/**
 * Detects a Datenschutz (privacy policy) link on a page.
 *
 * @param html    Raw HTML string.
 * @param baseUrl Final URL of the page, used to resolve relative hrefs.
 */
export const extractDatenschutz = (html: string | CheerioAPI, baseUrl: string): DatenschutzResult =>
  extractLegalLink(html, baseUrl, DATENSCHUTZ_KEYWORDS);
