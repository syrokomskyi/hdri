/*
<MODULE_CONTRACT>
<purpose>This module detects and extracts Impressum (legal notice) links from HTML content, providing a confidence score for the detection.</purpose>
<non-goals>
  <item>This module does not perform any HTML content fetching or network requests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the extractImpressum function to identify Impressum links.</item>
</CHANGE_SUMMARY>
*/

import type { CheerioAPI } from "cheerio";
import { type KeywordMatch, type LinkPresenceResult } from "./helpers.js";
import { extractLegalLink } from "./legal.js";

export type ImpressumResult = LinkPresenceResult;

const IMPRESSUM_KEYWORDS: KeywordMatch[] = [
  { keyword: "impressum", confidence: 90 },
  { keyword: "imprint", confidence: 90 },
  { keyword: "legalnotice", confidence: 90 },
  { keyword: "legaldisclosure", confidence: 90 },
  { keyword: "anbieterkennzeichnung", confidence: 90 },
  { keyword: "rechtlichehinweise", confidence: 90 },
  { keyword: "sitenotice", confidence: 90 },
  { keyword: "provideridentification", confidence: 90 },
  { keyword: "legalinformation", confidence: 70 },
  { keyword: "companyinformation", confidence: 70 },
  { keyword: "verantwortlicher", confidence: 70 },
  { keyword: "haftungsausschluss", confidence: 70 },
  { keyword: "disclaimer", confidence: 60 },
  { keyword: "legal", confidence: 50 },
];

/**
 * Detects an Impressum (legal notice) link on a page.
 *
 * @param html    Raw HTML string.
 * @param baseUrl Final URL of the page, used to resolve relative hrefs.
 */
export const extractImpressum = (html: string | CheerioAPI, baseUrl: string): ImpressumResult =>
  extractLegalLink(html, baseUrl, IMPRESSUM_KEYWORDS);
