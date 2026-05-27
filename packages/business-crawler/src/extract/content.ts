import { type CheerioAPI } from 'cheerio';
import { findKeywordMatch, resolveUrl, resolveCheerio, type KeywordMatch, type ContentSignalResult, type ContentLinkResult } from './helpers.js';

export type { ContentSignalResult, ContentLinkResult };

export const extractContactForm = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const selectors = [
    '[id*="contactform"]', '[class*="contactform"]',
    '[id*="contact-form"]', '[class*="contact-form"]',
    '[id*="kontaktformular"]', '[class*="kontaktformular"]',
    '[id*="kontakt-formular"]', '[class*="kontakt-formular"]',
    'form[action*="contact"]', 'form[action*="kontakt"]',
  ];
  for (const sel of selectors) {
    if ($(sel).length > 0) return { present: true, confidence: 85 };
  }
  let found = false;
  $('form').each((_i, form) => {
    if (found) return;
    if ($(form).find('input[type="email"], input[name*="email"], input[name*="mail"]').length > 0) found = true;
  });
  return found ? { present: true, confidence: 70 } : { present: false, confidence: null };
};

const PORTFOLIO_KEYWORDS: KeywordMatch[] = [
  { keyword: 'portfolio', confidence: 90 },
  { keyword: 'galerie', confidence: 85 },
  { keyword: 'gallery', confidence: 85 },
  { keyword: 'referenzen', confidence: 80 },
  { keyword: 'projekte', confidence: 75 },
  { keyword: 'arbeiten', confidence: 70 },
  { keyword: 'unsere-arbeiten', confidence: 80 },
  { keyword: 'bildergalerie', confidence: 85 },
  { keyword: 'fotogalerie', confidence: 85 },
  { keyword: 'unsere-projekte', confidence: 80 },
];

export const extractPortfolio = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  let best: KeywordMatch | null = null;
  $('a[href]').each((_i, el) => {
    if (best && best.confidence >= 85) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, PORTFOLIO_KEYWORDS);
    if (match && (!best || match.confidence > best.confidence)) best = match;
  });
  if (best) return { present: true, confidence: (best as KeywordMatch).confidence };
  const bodyText = $('body').text().toLowerCase();
  if (bodyText.includes('portfolio') || bodyText.includes('galerie') || bodyText.includes('referenzen')) {
    return { present: true, confidence: 60 };
  }
  return { present: false, confidence: null };
};

export const extractMap = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const mapIframePatterns = [
    'maps.google.com', 'google.com/maps', 'maps.googleapis.com',
    'openstreetmap.org', 'maps.apple.com',
  ];
  let found = false;
  $('iframe[src]').each((_i, el) => {
    if (found) return;
    const src = ($(el).attr('src') ?? '').toLowerCase();
    if (mapIframePatterns.some((p) => src.includes(p))) found = true;
  });
  if (found) return { present: true, confidence: 95 };
  const mapSelectors = [
    '[id*="map"]', '[class*="map"]', '[id*="karte"]', '[class*="karte"]',
    'div[id*="googlemap"]', 'div[class*="googlemap"]',
  ];
  for (const sel of mapSelectors) {
    if ($(sel).length > 0) return { present: true, confidence: 65 };
  }
  return { present: false, confidence: null };
};

const TEAM_KEYWORDS: KeywordMatch[] = [
  { keyword: 'unser-team', confidence: 90 },
  { keyword: 'unserteam', confidence: 90 },
  { keyword: 'uber-uns', confidence: 85 },
  { keyword: 'uberuns', confidence: 85 },
  { keyword: 'about-us', confidence: 85 },
  { keyword: 'aboutus', confidence: 85 },
  { keyword: 'our-team', confidence: 85 },
  { keyword: 'ourteam', confidence: 85 },
  { keyword: 'team', confidence: 70 },
  { keyword: 'mitarbeiter', confidence: 80 },
  { keyword: 'wir-sind', confidence: 80 },
  { keyword: 'wirstellen', confidence: 80 },
  { keyword: 'unsere-mitarbeiter', confidence: 85 },
  { keyword: 'uber-mich', confidence: 80 },
  { keyword: 'wer-sind-wir', confidence: 85 },
];

export const extractTeamPage = (html: string | CheerioAPI, baseUrl: string): ContentLinkResult => {
  const $ = resolveCheerio(html);
  let url: string | null = null;
  let confidence: number | null = null;
  $('a[href]').each((_i, el) => {
    if (url) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, TEAM_KEYWORDS);
    if (match) { url = resolveUrl(href, baseUrl); confidence = match.confidence; }
  });
  return { present: url !== null, url, confidence };
};

const TESTIMONIAL_KEYWORDS: KeywordMatch[] = [
  { keyword: 'testimonials', confidence: 90 },
  { keyword: 'kundenstimmen', confidence: 90 },
  { keyword: 'bewertungen', confidence: 85 },
  { keyword: 'erfahrungen', confidence: 80 },
  { keyword: 'meinungen', confidence: 75 },
  { keyword: 'referenzen', confidence: 70 },
  { keyword: 'kundenreferenzen', confidence: 85 },
  { keyword: 'kundenmeinungen', confidence: 85 },
  { keyword: 'reviews', confidence: 80 },
];

export const extractTestimonials = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  let best: KeywordMatch | null = null;
  $('a[href]').each((_i, el) => {
    if (best && best.confidence >= 85) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, TESTIMONIAL_KEYWORDS);
    if (match && (!best || match.confidence > best.confidence)) best = match;
  });
  if (best) return { present: true, confidence: (best as KeywordMatch).confidence };
  const sectionSels = [
    '[id*="testimonial"]', '[class*="testimonial"]',
    '[id*="bewertung"]', '[class*="bewertung"]',
    '[id*="kundenstimmen"]', '[class*="kundenstimmen"]',
  ];
  for (const sel of sectionSels) {
    if ($(sel).length > 0) return { present: true, confidence: 75 };
  }
  return { present: false, confidence: null };
};

const CERT_TERMS = ['zertifikat', 'zertifiziert', 'certification', 'certified', 'din ', 'iso ', 'tüv', 'tuev', 'dekra', 'geprüft', 'geprueft', 'qualitätszertifikat'];

export const extractCertifications = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const bodyText = $('body').text().toLowerCase();
  const imgAlts = $('img[alt]').map((_i, el) => ($(el).attr('alt') ?? '').toLowerCase()).get().join(' ');
  const combined = `${bodyText} ${imgAlts}`;
  const found = CERT_TERMS.some((t) => combined.includes(t));
  return found ? { present: true, confidence: 70 } : { present: false, confidence: null };
};

// 'preis' and 'sieger' need word boundaries to avoid matching 'Preisliste', 'Preise', 'Siegerehrung' etc.
const AWARD_TERMS_PLAIN = ['auszeichnung', 'award', 'gewinner', 'winner', 'ehrung', 'preisträger', 'preistraeger', 'ausgezeichnet'];
const AWARD_TERMS_WORD = /\bpreis\b|\bsieger\b/;

export const extractAwards = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const bodyText = $('body').text().toLowerCase();
  const imgAlts = $('img[alt]').map((_i, el) => ($(el).attr('alt') ?? '').toLowerCase()).get().join(' ');
  const combined = `${bodyText} ${imgAlts}`;
  const found = AWARD_TERMS_PLAIN.some((t) => combined.includes(t)) || AWARD_TERMS_WORD.test(combined);
  return found ? { present: true, confidence: 65 } : { present: false, confidence: null };
};

// 'kammer' alone matches Schlafkammer etc. — use only compound forms or word boundary
const MEMBERSHIP_TERMS_PLAIN = [
  'mitglied ', 'mitgliedschaft', 'membership', 'verband', 'handwerkskammer', 'handelskammer',
  'hwk', 'ihk', 'innung', 'bund ', 'vereinigung', 'fachverband', 'berufsverband', 'gilde',
  'bundesverband', 'landesverband', 'zentralverband',
];
// 'kammer' only as a standalone word (e.g. "Kammer der" or "IHK-Kammer")
const MEMBERSHIP_TERMS_WORD = /\bkammer\b/;

export const extractMemberships = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const bodyText = $('body').text().toLowerCase();
  const found = MEMBERSHIP_TERMS_PLAIN.some((t) => bodyText.includes(t)) || MEMBERSHIP_TERMS_WORD.test(bodyText);
  return found ? { present: true, confidence: 65 } : { present: false, confidence: null };
};

const MEISTER_TERMS = [
  'meisterbetrieb', 'handwerksmeister', 'meisterbrief', 'meisterin', 'meister ',
  'hwk-meister', 'staatlich geprüft', 'staatlich geprueft',
];

export const extractMeister = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  const bodyText = $('body').text().toLowerCase();
  const imgAlts = $('img[alt]').map((_i, el) => ($(el).attr('alt') ?? '').toLowerCase()).get().join(' ');
  const combined = `${bodyText} ${imgAlts}`;
  const found = MEISTER_TERMS.some((t) => combined.includes(t));
  return found ? { present: true, confidence: 80 } : { present: false, confidence: null };
};

const CASE_STUDY_KEYWORDS: KeywordMatch[] = [
  { keyword: 'case-study', confidence: 90 },
  { keyword: 'casestudy', confidence: 90 },
  { keyword: 'case-studies', confidence: 90 },
  { keyword: 'casestudies', confidence: 90 },
  { keyword: 'fallstudie', confidence: 90 },
  { keyword: 'fallstudien', confidence: 90 },
  { keyword: 'kundenprojekt', confidence: 80 },
  { keyword: 'referenzprojekt', confidence: 80 },
  { keyword: 'projektbericht', confidence: 75 },
  { keyword: 'erfolgsgeschichte', confidence: 75 },
  { keyword: 'success-story', confidence: 75 },
  { keyword: 'successstory', confidence: 75 },
];

export const extractCaseStudies = (html: string | CheerioAPI): ContentSignalResult => {
  const $ = resolveCheerio(html);
  let best: KeywordMatch | null = null;
  $('a[href]').each((_i, el) => {
    if (best && best.confidence >= 85) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().toLowerCase();
    const match = findKeywordMatch(href, text, CASE_STUDY_KEYWORDS);
    if (match && (!best || match.confidence > best.confidence)) best = match;
  });
  return best
    ? { present: true, confidence: (best as KeywordMatch).confidence }
    : { present: false, confidence: null };
};
