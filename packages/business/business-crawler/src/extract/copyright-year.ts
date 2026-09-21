/*
<MODULE_CONTRACT>
<purpose>This module extracts the most recent copyright year from HTML page text, prioritizing footer content for higher precision.</purpose>
<non-goals>
  <item>This module does not validate the authenticity of the copyright year found.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of copyright year extraction functionality.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "cheerio";
import { resolveCheerio } from "./helpers.js";

export type CopyrightYearResult = {
  /** Most recent copyright year found in the page, or null if not detected. */
  year: number | null;
};

/**
 * Extracts the most recent copyright year from page text.
 *
 * Matches patterns (case-insensitive, any language):
 *   © 2026
 *   © 2019–2026   (range — we take the upper bound)
 *   Copyright 2026
 *   (c) 2026
 *
 * Searches `<footer>` text first (higher precision), then falls back to full body text.
 * Returns the highest valid year found (clamped to 1990–current+1).
 */
export const extractCopyrightYear = (html: string | CheerioAPI): CopyrightYearResult => {
  const $ = resolveCheerio(html);
  const footerText = $("footer").text();
  const bodyText = $("body").text();

  const findBestYear = (text: string): number | null => {
    const re = /(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[–\-–—]\s*)?(\d{4})/gi;
    const currentYear = new Date().getFullYear();
    let best: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const year = parseInt(m[1]!, 10);
      if (year >= 1990 && year <= currentYear + 1) {
        if (best === null || year > best) best = year;
      }
    }
    return best;
  };

  const year = findBestYear(footerText) ?? findBestYear(bodyText);
  return { year };
};
