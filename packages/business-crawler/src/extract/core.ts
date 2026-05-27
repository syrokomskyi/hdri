import { type CheerioAPI } from 'cheerio';
import { resolveUrl, dedup, normalisePhone, resolveCheerio } from './helpers.js';
import { extractImpressum } from './impressum.js';
import { extractDatenschutz } from './datenschutz.js';
import { extractOpeningHours } from './opening-hours.js';
import { extractCookieBanner } from './cookie-banner.js';
import { extractCopyrightYear } from './copyright-year.js';

export type ContactItem = {
  raw: string;
  norm: string;
};

export type SocialLink = {
  platform: string;
  url: string;
};

export type ExtractResult = {
  pageTitle: string | null;
  metaDescription: string | null;
  /** Text of the first H1 element. */
  h1Text: string | null;
  /** Canonical URL from <link rel="canonical">. */
  canonicalUrl: string | null;
  /** BCP-47 language tag from <html lang="...">. */
  lang: string | null;
  /** True if a link containing "impressum" was found (DSGVO compliance). */
  impressumPresent: boolean;
  impressumUrl: string | null;
  impressumConfidence: number | null;
  /** True if a Datenschutz/privacy policy link was found. */
  datenschutzPresent: boolean;
  datenschutzUrl: string | null;
  datenschutzConfidence: number | null;
  /** Opening hours from JSON-LD structured data, if found. */
  openingHoursText: string | null;
  /** True if common cookie-consent UI elements were detected. */
  cookieBannerPresent: boolean;
  phones: ContactItem[];
  emails: ContactItem[];
  socialLinks: SocialLink[];
  /**
   * Most recent copyright year found in the page (e.g. 2026 from "© 2023–2026").
   * null when no recognisable copyright notice is present.
   */
  copyrightYear: number | null;
};

/**
 * German phone number pattern.
 */
const PHONE_RE =
  /(?:(?:\+49|0049)[\s\-\/\.]?[\d][\s\-\/\.]?(?:[\d][\s\-\/\.]?){6,13}|0[\d][\s\-\/\.]?(?:[\d][\s\-\/\.]?){5,12})/g;

/** Standard e-mail regex — good enough for extraction (not validation). */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const SOCIAL_HOSTNAMES: Record<string, string> = {
  'facebook.com':    'facebook',
  'fb.com':          'facebook',
  'instagram.com':   'instagram',
  'twitter.com':     'twitter',
  'x.com':           'twitter',
  'linkedin.com':    'linkedin',
  'youtube.com':     'youtube',
  'youtu.be':        'youtube',
  'xing.com':        'xing',
  'kununu.com':      'kununu',
  'tiktok.com':      'tiktok',
  'pinterest.com':   'pinterest',
  'whatsapp.com':    'whatsapp',
  'wa.me':           'whatsapp',
};

/**
 * Extracts all structured signals from a raw HTML page.
 *
 * Rule-based only — no LLM calls. Calls each focused extractor and assembles
 * the combined `ExtractResult`. Prefer the focused extractors directly in new code.
 */
export const extractPageSignals = (html: string | CheerioAPI, baseUrl: string): ExtractResult => {
  const $ = resolveCheerio(html);

  const impressum = extractImpressum($, baseUrl);
  const datenschutz = extractDatenschutz($, baseUrl);
  const openingHours = extractOpeningHours($);
  const cookieBanner = extractCookieBanner($);
  const copyrightYearResult = extractCopyrightYear($);

  const pageTitle = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const h1Text = $('h1').first().text().trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const lang = $('html').attr('lang')?.trim().slice(0, 20) || null;

  const bodyText = $('body').text();
  const rawPhones = bodyText.match(PHONE_RE) ?? [];
  const phones: ContactItem[] = dedup(
    rawPhones.map((raw) => ({ raw: raw.trim(), norm: normalisePhone(raw.trim()) })),
    (p) => p.norm,
  );

  const emailSet = new Set<string>();
  const emails: ContactItem[] = [];
  $('a[href^="mailto:"]').each((_i, el) => {
    const raw = ($(el).attr('href') ?? '').replace(/^mailto:/i, '').split('?')[0]!.trim();
    if (raw && !emailSet.has(raw.toLowerCase())) {
      emailSet.add(raw.toLowerCase());
      emails.push({ raw, norm: raw.toLowerCase() });
    }
  });
  const rawEmails = bodyText.match(EMAIL_RE) ?? [];
  for (const raw of rawEmails) {
    if (!emailSet.has(raw.toLowerCase())) {
      emailSet.add(raw.toLowerCase());
      emails.push({ raw, norm: raw.toLowerCase() });
    }
  }

  const socialMap = new Map<string, string>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    let hn = '';
    try {
      hn = new URL(resolveUrl(href, baseUrl)).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return;
    }
    const platform = SOCIAL_HOSTNAMES[hn];
    if (platform && !socialMap.has(platform)) {
      socialMap.set(platform, resolveUrl(href, baseUrl));
    }
  });

  const socialLinks: SocialLink[] = Array.from(socialMap.entries()).map(
    ([platform, url]) => ({ platform, url }),
  );

  return {
    pageTitle, metaDescription, h1Text, canonicalUrl, lang,
    impressumPresent: impressum.present,
    impressumUrl: impressum.url,
    impressumConfidence: impressum.confidence,
    datenschutzPresent: datenschutz.present,
    datenschutzUrl: datenschutz.url,
    datenschutzConfidence: datenschutz.confidence,
    openingHoursText: openingHours.text,
    cookieBannerPresent: cookieBanner.present,
    phones, emails, socialLinks,
    copyrightYear: copyrightYearResult.year,
  };
};
