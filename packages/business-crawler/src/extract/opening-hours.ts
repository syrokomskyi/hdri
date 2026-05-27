import { type CheerioAPI } from 'cheerio';
import { resolveCheerio } from './helpers.js';

export type OpeningHoursResult = {
  /** Raw text of opening hours, or null if not found. */
  text: string | null;
  /** Origin of the data: 'jsonld' if found in JSON-LD, 'text' if extracted from body text heuristics. */
  source: 'jsonld' | 'text' | null;
  confidence: number | null;
};

/**
 * Extracts opening hours from a page.
 *
 * Strategy (in order):
 *  1. JSON-LD structured data (`openingHours` / `openingHoursSpecification`) — source='jsonld'
 *  2. Plain-text heuristics searching for common patterns near "öffnungszeiten" / "opening hours" — source='text'
 */
export const extractOpeningHours = (html: string | CheerioAPI): OpeningHoursResult => {
  const $ = resolveCheerio(html);

  // 1. JSON-LD
  let foundText: string | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (foundText) return false;
    try {
      const obj = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
      const hours =
        obj.openingHours ??
        (obj.openingHoursSpecification && JSON.stringify(obj.openingHoursSpecification));
      if (hours) {
        foundText = Array.isArray(hours)
          ? hours.join(', ')
          : String(hours).slice(0, 500);
        return false;
      }
    } catch {
      // invalid JSON — skip
    }
    return undefined;
  });
  if (foundText) {
    return { text: foundText, source: 'jsonld', confidence: 90 };
  }

  // 2. Text heuristics
  const bodyText = $('body').text();
  const hoursHeadingRe =
    /(?:öffnungszeiten|opening\s+hours|business\s+hours|horaires)[^\n]{0,60}\n([^\n]{5,120})/i;
  const textMatch = hoursHeadingRe.exec(bodyText);
  if (textMatch) {
    return { text: textMatch[1]!.trim(), source: 'text', confidence: 50 };
  }

  return { text: null, source: null, confidence: null };
};
