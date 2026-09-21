/*
<MODULE_CONTRACT>
<purpose>This module extracts structured contact details from a German Impressum page using Cheerio for HTML parsing.</purpose>
<non-goals>
  <item>This module does not handle non-German Impressum pages or any other types of web pages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the Impressum contact details extraction logic.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "cheerio";
import { resolveCheerio } from "./helpers.js";

/**
 * Structured contact details parsed from a German Impressum page.
 *
 * PRIVACY: this is personal/contact data (owner names, phone, email, address).
 * It is collected only in the factory and must never enter the observation /
 * HDRI / published-dashboard pipeline (it has no entry in EXT_SIGNAL_MAP).
 */
export type ImpressumContacts = {
  companyName: string | null;
  /** Names following Inhaber / Geschäftsführer / Vertreten durch … */
  personNames: string[];
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  /** USt-IdNr (e.g. DE123456789). */
  vatId: string | null;
};

const ROLE_KEYWORDS = [
  "vertreten durch",
  "vertretungsberechtigter",
  "vertretungsberechtigte",
  "geschäftsführerin",
  "geschäftsführer",
  "geschäftsführung",
  "inhaberin",
  "inhaber",
  "verantwortlich für den inhalt",
  "verantwortliche",
  "verantwortlicher",
];

const LEGAL_FORM =
  /\b(GmbH|gGmbH|mbH|UG|AG|KG|OHG|GbR|e\.?\s?K\.?|e\.?\s?V\.?|UG \(haftungsbeschränkt\))\b/;

const emptyResult = (): ImpressumContacts => ({
  companyName: null,
  personNames: [],
  street: null,
  postalCode: null,
  city: null,
  phone: null,
  email: null,
  vatId: null,
});

/** De-obfuscate common email spellings: name [at] domain [dot] de → name@domain.de */
const deobfuscateEmail = (text: string): string =>
  text
    .replace(/\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*|\s+at\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*|\s+dot\s+/gi, ".");

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PLZ_CITY_RE = /\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .\-/]{1,50})/;
const STREET_RE = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,60}?\s\d+\s?[a-zA-Z]?)$/;
const VAT_RE = /\b(DE\s?\d{9})\b/;
const PHONE_RE = /(\+?[\d][\d\s/().-]{6,}\d)/;

const looksLikeName = (s: string): boolean => {
  if (!s) return false;
  if (s.length > 70) return false;
  if (EMAIL_RE.test(s)) return false;
  if (/\d/.test(s)) return false;
  if (LEGAL_FORM.test(s)) return false;
  if (/(straße|strasse|str\.|platz|weg|tel|fax|@|http)/i.test(s)) return false;
  // 2–5 capitalised tokens (allowing titles like Dr., Dipl.-Ing.)
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 6) return false;
  return tokens.every((t) => /^[A-ZÄÖÜ][\p{L}.\-]*$/u.test(t));
};

const cleanName = (s: string): string =>
  s
    .replace(/^[\s:–-]+/, "")
    .replace(/[\s,;.]+$/, "")
    .trim();

/**
 * Best-effort extraction of contact details from a German Impressum page.
 * Every field is nullable — the parser never fabricates data it cannot find.
 */
export const extractImpressumContacts = (html: string | CheerioAPI): ImpressumContacts => {
  // Re-parse into an independent DOM: the gogol shares a cached Cheerio instance
  // across extractors, so we must not mutate it when normalising block boundaries.
  const base = resolveCheerio(html);
  const $ = resolveCheerio(base.html());
  const result = emptyResult();

  // Prefer explicit mailto:/tel: links — most reliable.
  $("a[href^='mailto:']").each((_i, el) => {
    if (result.email) return;
    const href = $(el).attr("href") ?? "";
    const addr = href.slice("mailto:".length).split("?")[0]?.trim();
    if (addr && EMAIL_RE.test(addr)) result.email = addr.toLowerCase();
  });
  $("a[href^='tel:']").each((_i, el) => {
    if (result.phone) return;
    const href = $(el).attr("href") ?? "";
    const num = href.slice("tel:".length).trim();
    if (num) result.phone = num;
  });

  // Cheerio's .text() drops block boundaries; insert newlines so line-based
  // parsing is robust regardless of source whitespace.
  $("br").replaceWith("\n");
  $("p,div,li,tr,h1,h2,h3,h4,h5,h6,address,section,article").append("\n");

  const rawText = $("body").length ? $("body").text() : $.root().text();
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  const fullText = lines.join("\n");

  // Email (fallback, with de-obfuscation).
  if (!result.email) {
    const m = deobfuscateEmail(fullText).match(EMAIL_RE);
    if (m) result.email = m[0].toLowerCase();
  }

  // Phone (fallback near Tel/Telefon/Fon).
  if (!result.phone) {
    for (const line of lines) {
      if (/\b(tel|telefon|fon|phone)\b/i.test(line)) {
        const m = line.match(PHONE_RE);
        if (m) {
          result.phone = m[1].trim();
          break;
        }
      }
    }
  }

  // VAT id.
  const vat = fullText.match(VAT_RE);
  if (vat) result.vatId = vat[1].replace(/\s+/g, "");

  // Address: PLZ + city, with the preceding street line.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(PLZ_CITY_RE);
    if (m) {
      result.postalCode = m[1]!;
      result.city = m[2]!.trim();
      for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
        const sm = lines[j]!.match(STREET_RE);
        if (sm) {
          result.street = sm[1]!.trim();
          break;
        }
      }
      break;
    }
  }

  // Person names following role keywords (same line after the keyword, else next line).
  const names = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i]!.toLowerCase();
    const kw = ROLE_KEYWORDS.find((k) => lower.includes(k));
    if (!kw) continue;
    const idx = lower.indexOf(kw) + kw.length;
    const sameLine = cleanName(lines[i]!.slice(idx));
    if (looksLikeName(sameLine)) {
      names.add(sameLine);
    } else if (i + 1 < lines.length) {
      const next = cleanName(lines[i + 1]!);
      if (looksLikeName(next)) names.add(next);
    }
  }
  result.personNames = [...names];

  // Company name: a nearby line carrying a legal form, else the first plausible
  // non-role line. Best-effort and nullable.
  const legalLine = lines.find((l) => LEGAL_FORM.test(l) && l.length <= 90);
  if (legalLine) {
    result.companyName = legalLine.replace(/\s+/g, " ").trim();
  }

  return result;
};
