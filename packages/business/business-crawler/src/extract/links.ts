/*
<MODULE_CONTRACT>
<purpose>This module extracts and identifies specific external links from HTML content, focusing on business-related domains.</purpose>
<non-goals>
  <item>This module does not handle the downloading or fetching of HTML content from the web.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of link extraction functions for various business-related domains.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "cheerio";
import { findExternalLink, resolveCheerio, type LinkPresenceResult } from "./helpers.js";

const makeLinkExtractor =
  (patterns: string[], confidence: number) =>
  (html: string | CheerioAPI): LinkPresenceResult => {
    const url = findExternalLink(html, patterns);
    return { present: url !== null, url, confidence: url ? confidence : null };
  };

export const extractLinkHandelsregister = makeLinkExtractor(["handelsregister.de"], 95);
export const extractLinkUnternehmensregister = makeLinkExtractor(["unternehmensregister.de"], 95);

const KAMMERN_PATTERNS = [
  "hwk",
  "ihk",
  "handwerkskammer",
  "handwerkskammer.de",
  "ihk.de",
  "kammern.de",
  "hwk.de",
];

export const extractLinkKammern = makeLinkExtractor(KAMMERN_PATTERNS, 85);

const INDUSTRY_CATALOG_PATTERNS = [
  "gelbeseiten.de",
  "yelp.de",
  "yelp.com",
  "11880.com",
  "meinestadt.de",
  "branchenbuch.de",
  "wlw.de",
  "europages.de",
  "firmenwissen.de",
  "cylex.de",
  "klicktel.de",
  "dasoertliche.de",
  "herold.at",
];

export const extractLinkIndustryCatalogs = makeLinkExtractor(INDUSTRY_CATALOG_PATTERNS, 80);

const GOOGLE_BUSINESS_PATTERNS = ["business.google.com", "g.page", "maps.app.goo.gl", "goo.gl"];

export const extractLinkGoogleBusiness = (html: string | CheerioAPI): LinkPresenceResult => {
  const $ = resolveCheerio(html);
  let found: string | null = null;
  $("a[href]").each((_i, el) => {
    if (found) return;
    const href = $(el).attr("href") ?? "";
    let hostname = "";
    try {
      hostname = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return;
    }
    if (GOOGLE_BUSINESS_PATTERNS.some((p) => hostname === p || hostname.endsWith(`.${p}`))) {
      found = href;
    }
    if (!found && (hostname === "maps.google.com" || hostname === "google.com")) {
      if (href.includes("cid=") || href.includes("/maps/place/")) found = href;
    }
  });
  return { present: found !== null, url: found, confidence: found ? 90 : null };
};
