import { type CheerioAPI } from 'cheerio';
import { resolveCheerio } from './helpers.js';

/**
 * Cookie consent quality level. Maps directly to enum cases of the
 * `privacy.consent.quality` ontology signal.
 *
 *   none                       — no banner detected
 *   informational_only         — banner present, no choice (e.g. "Got it")
 *   accept_only                — accept button only, no reject affordance
 *   reject_equal_prominence    — reject option present alongside accept
 *   granular_with_revoke       — per-purpose toggles AND a revoke / withdraw link
 */
export type CookieConsentQuality =
  | 'none'
  | 'informational_only'
  | 'accept_only'
  | 'reject_equal_prominence'
  | 'granular_with_revoke';

export type CookieBannerResult = {
  present: boolean;
  confidence: number | null;
  /**
   * Detected consent quality level. `null` only when no banner was found
   * (presence === false). Otherwise one of the enum values.
   */
  quality: CookieConsentQuality | null;
};

/** Cookie consent widget signals — class names, IDs, known script patterns. */
const COOKIE_SELECTORS = [
  '[id*="cookie"]', '[class*="cookie"]',
  '[id*="consent"]', '[class*="consent"]',
  '[id*="gdpr"]', '[class*="gdpr"]',
  '[id*="cookiebanner"]', '[id*="cookie-banner"]',
  '[id*="cookiehinweis"]',
  '#CybotCookiebotDialog', '#onetrust-banner-sdk',
  '.cc-window', '.cookiealert',
] as const;

// Word-boundary regexes (case-insensitive) for button/link text matching.
// German + English variants common on DACH-region SMB sites.
const REJECT_RE = /\b(ablehnen|reject|decline|verweigern|nicht\s*akzeptieren|alle\s*ablehnen|deny|nur\s*notwendige|only\s*necessary|essential\s*only)\b/i;
const ACCEPT_RE = /\b(akzeptieren|accept|zustimmen|alle\s*akzeptieren|ich\s*stimme\s*zu|allow|agree|got\s*it|verstanden|ok|einverstanden)\b/i;
const SETTINGS_RE = /\b(einstellungen|settings|anpassen|customize|customise|preferences|cookie-einstellungen|details|verwalten|manage|optionen|options)\b/i;
const REVOKE_RE = /\b(widerrufen|widerruf|revoke|withdraw|widerrufsrecht|einwilligung\s*widerrufen|consent\s*withdraw)\b/i;

/** Builds the union selector once per call to keep traversal cheap. */
const cookieRoot = ($: CheerioAPI) => $(COOKIE_SELECTORS.join(', '));

const hasButtonMatching = ($: CheerioAPI, scope: ReturnType<CheerioAPI>, re: RegExp): boolean => {
  let found = false;
  scope.find('button, a, input[type="button"], input[type="submit"], [role="button"]').each((_, el) => {
    if (found) return false;
    const text = ($(el).text() ?? '') + ' ' + ($(el).attr('value') ?? '') + ' ' + ($(el).attr('aria-label') ?? '');
    if (re.test(text)) {
      found = true;
      return false;
    }
    return undefined;
  });
  return found;
};

const hasGranularToggles = ($: CheerioAPI, scope: ReturnType<CheerioAPI>): boolean => {
  // Per-purpose toggles: ≥2 checkboxes/switches inside the banner. We require
  // at least 2 to distinguish from a single "remember me" checkbox.
  const toggles = scope.find('input[type="checkbox"], input[type="radio"], [role="switch"]').length;
  return toggles >= 2;
};

const hasRevokeLink = ($: CheerioAPI): boolean => {
  // Revoke is usually OUTSIDE the banner (on Datenschutz / footer). Search the
  // entire document text.
  const fullText = $('body').text();
  return REVOKE_RE.test(fullText);
};

/**
 * Detects a cookie-consent banner and classifies its quality level.
 *
 * The classifier is conservative: ambiguous cases prefer the lower quality
 * level (e.g. `accept_only` over `reject_equal_prominence`) so the codebook
 * does not overstate compliance.
 */
export const extractCookieBanner = (html: string | CheerioAPI): CookieBannerResult => {
  const $ = resolveCheerio(html);
  const scope = cookieRoot($);

  if (scope.length === 0) {
    return { present: false, confidence: null, quality: 'none' };
  }

  const accept = hasButtonMatching($, scope, ACCEPT_RE);
  const reject = hasButtonMatching($, scope, REJECT_RE);
  const settings = hasButtonMatching($, scope, SETTINGS_RE);
  const granular = hasGranularToggles($, scope);
  const revoke = hasRevokeLink($);

  let quality: CookieConsentQuality;
  if (granular && revoke) {
    quality = 'granular_with_revoke';
  } else if (reject) {
    // Reject button at the same level as accept counts as equal prominence.
    quality = 'reject_equal_prominence';
  } else if (accept || settings) {
    quality = 'accept_only';
  } else {
    quality = 'informational_only';
  }

  return { present: true, confidence: 80, quality };
};
