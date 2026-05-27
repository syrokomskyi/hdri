import { load, type CheerioAPI } from 'cheerio';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type KeywordMatch = { keyword: string; confidence: number };

export type SimplePresenceResult = { present: boolean };
export type LinkPresenceResult   = { present: boolean; url: string | null; confidence: number | null };
export type ContentSignalResult  = { present: boolean; confidence: number | null };
export type ContentLinkResult    = { present: boolean; url: string | null; confidence: number | null };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const normalizeMatchText = (s: string): string =>
  s.toLowerCase().replace(/[\s\-_/]/g, '');

export const findKeywordMatch = (
  href: string,
  text: string,
  keywords: KeywordMatch[],
): KeywordMatch | null => {
  const nh = normalizeMatchText(href);
  const nt = normalizeMatchText(text);
  for (const kw of keywords) {
    if (nh.includes(kw.keyword) || nt.includes(kw.keyword)) {
      return kw;
    }
  }
  return null;
};

export const resolveUrl = (href: string, base: string): string => {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
};

export const dedup = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export const normalisePhone = (raw: string): string =>
  raw.replace(/[\s\-/.]/g, '').replace(/^0049/, '+49').replace(/^0/, '+49');

/**
 * Given a raw HTML string or an existing CheerioAPI instance, returns the
 * CheerioAPI. Use this so downstream extractors can accept either form and
 * avoid redundant `cheerio.load()` calls when a DOM is already parsed.
 */
export const resolveCheerio = (htmlOr$: string | CheerioAPI): CheerioAPI => {
  if (typeof htmlOr$ === 'string') return load(htmlOr$);
  return htmlOr$;
};

/**
 * Extracts the set of all `@type` values (lowercased, flattened) from every
 * JSON-LD block on the page. Handles both single objects and arrays at root.
 */
export const extractSchemaOrgTypes = (html: string | CheerioAPI): Set<string> => {
  const types = new Set<string>();
  const collect = (obj: unknown): void => {
    if (Array.isArray(obj)) { obj.forEach(collect); return; }
    if (obj && typeof obj === 'object') {
      const rec = obj as Record<string, unknown>;
      const t = rec['@type'];
      if (typeof t === 'string') types.add(t.toLowerCase());
      else if (Array.isArray(t)) t.forEach((v) => { if (typeof v === 'string') types.add(v.toLowerCase()); });
      // recurse into all nested values (covers @graph, nested entities like openingHoursSpecification, etc.)
      Object.values(rec).forEach((v) => { if (v && typeof v === 'object') collect(v); });
    }
  };

  if (typeof html === 'string') {
    const scriptRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
      try {
        const parsed: unknown = JSON.parse(m[1] ?? '{}');
        collect(parsed);
      } catch {
        // invalid JSON — skip
      }
    }
  } else {
    html('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const parsed: unknown = JSON.parse(html(el).html() ?? '{}');
        collect(parsed);
      } catch {
        // invalid JSON — skip
      }
    });
  }
  return types;
};

/**
 * Finds the first `<a href>` whose hostname matches any of the given domain
 * patterns (plain substring match on lowercased hostname).
 * Returns the first matching href string or null.
 */
export const findExternalLink = (html: string | CheerioAPI, hostPatterns: string[]): string | null => {
  const $ = resolveCheerio(html);
  let found: string | null = null;
  $('a[href]').each((_i, el) => {
    if (found) return;
    const href = $(el).attr('href') ?? '';
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase().replace(/^www\./, ''); } catch { return; }
    for (const pat of hostPatterns) {
      if (hostname === pat || hostname.endsWith(`.${pat}`) || hostname.includes(pat)) {
        found = href;
        return;
      }
    }
  });
  return found;
};
