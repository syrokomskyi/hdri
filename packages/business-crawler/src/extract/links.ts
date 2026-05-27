import { type CheerioAPI } from 'cheerio';
import { findExternalLink, resolveCheerio, type LinkPresenceResult } from './helpers.js';

export const extractLinkHandelsregister = (html: string | CheerioAPI): LinkPresenceResult => {
  const url = findExternalLink(html, ['handelsregister.de']);
  return { present: url !== null, url, confidence: url ? 95 : null };
};

export const extractLinkUnternehmensregister = (html: string | CheerioAPI): LinkPresenceResult => {
  const url = findExternalLink(html, ['unternehmensregister.de']);
  return { present: url !== null, url, confidence: url ? 95 : null };
};

const KAMMERN_PATTERNS = [
  'hwk', 'ihk', 'handwerkskammer', 'handwerkskammer.de',
  'ihk.de', 'kammern.de', 'hwk.de',
];

export const extractLinkKammern = (html: string | CheerioAPI): LinkPresenceResult => {
  const url = findExternalLink(html, KAMMERN_PATTERNS);
  return { present: url !== null, url, confidence: url ? 85 : null };
};

const INDUSTRY_CATALOG_PATTERNS = [
  'gelbeseiten.de', 'yelp.de', 'yelp.com', '11880.com', 'meinestadt.de',
  'branchenbuch.de', 'wlw.de', 'europages.de', 'firmenwissen.de',
  'cylex.de', 'klicktel.de', 'dasoertliche.de', 'herold.at',
];

export const extractLinkIndustryCatalogs = (html: string | CheerioAPI): LinkPresenceResult => {
  const url = findExternalLink(html, INDUSTRY_CATALOG_PATTERNS);
  return { present: url !== null, url, confidence: url ? 80 : null };
};

const GOOGLE_BUSINESS_PATTERNS = [
  'business.google.com', 'g.page', 'maps.app.goo.gl', 'goo.gl',
];

export const extractLinkGoogleBusiness = (html: string | CheerioAPI): LinkPresenceResult => {
  const $ = resolveCheerio(html);
  let found: string | null = null;
  $('a[href]').each((_i, el) => {
    if (found) return;
    const href = $(el).attr('href') ?? '';
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase().replace(/^www\./, ''); } catch { return; }
    if (GOOGLE_BUSINESS_PATTERNS.some((p) => hostname === p || hostname.endsWith(`.${p}`))) {
      found = href;
    }
    if (!found && (hostname === 'maps.google.com' || hostname === 'google.com')) {
      if (href.includes('cid=') || href.includes('/maps/place/')) found = href;
    }
  });
  return { present: found !== null, url: found, confidence: found ? 90 : null };
};
