/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for company detail pages from www.stadtbranchenbuch.com — this module handles www stadtbranchenbuch com parser operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not parse SERP listing pages.</item>
  <item>Do not handle other sources.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rename StadtbranchenbuchDetailParser to WwwStadtbranchenbuchComParser.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
  <item>Add DOM fallback for websiteUrl when JSON-LD url is absent (RFC-0069).</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from "cheerio";
import type { SourceParser } from "./types.js";
import type { SourceBusinessSeed, SourceParseResult } from "../source-records.js";
import { isNoiseFile } from "./noise-filter.js";

interface LocalBusinessJsonLd {
  "@type"?: string;
  name?: string;
  telephone?: string;
  url?: string;
  address?: {
    streetAddress?: string;
    postalCode?: string;
    addressLocality?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
}

export class WwwStadtbranchenbuchComParser implements SourceParser {
  readonly sourceId = "www.stadtbranchenbuch.com";

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: "stadtbranchenbuch-detail-ignored", items: [], warnings: [] };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];

    const item = this.parseDetailPage($, content, fileName);
    if (item) {
      items.push(item);
    } else {
      warnings.push(`No company data found in detail page: ${fileName}`);
    }

    return { parserKind: "stadtbranchenbuch-detail-html", items, warnings };
  }

  private parseDetailPage(
    $: cheerio.CheerioAPI,
    content: string,
    fileName: string,
  ): SourceBusinessSeed | null {
    const jsonLd = this.extractLocalBusinessJsonLd(content);

    const businessName = jsonLd?.name?.trim() || $("h1").first().text().trim() || null;

    if (!businessName) return null;

    const ogUrl = $('meta[property="og:url"]').attr("content")?.trim() || null;
    const sourceProfileUrl = ogUrl;

    const city = this.extractCityFromUrl(ogUrl) ?? ($(".slogan-sub").first().text().trim() || null);

    const eintragId =
      $('input[name="eintragId"]').attr("value")?.trim() || this.extractIdFromFilename(fileName);
    const sourceItemKey = `sbb_${eintragId}`;

    const phone = jsonLd?.telephone?.trim() || this.extractPhoneFromDom($) || null;

    const streetAddress = this.extractStreetFromDom($) || null;
    const postalCode = this.extractPostalCodeFromDom($) || null;
    const cityFromDom = this.extractCityFromDom($) || null;

    const category = this.extractCategory($) || null;

    return {
      sourceItemKey,
      sourcePageNumber: null,
      businessName,
      streetAddress,
      postalCode,
      city: cityFromDom ?? city,
      phone,
      email: null,
      websiteUrl: this.normalizeUrl(jsonLd?.url ?? null) || this.extractWebsiteUrlFromDom($),
      category,
      sourceProfileUrl,
      raw: {
        sourceFile: fileName,
        eintragId,
        lat: jsonLd?.geo?.latitude ?? null,
        lng: jsonLd?.geo?.longitude ?? null,
      },
    };
  }

  private extractLocalBusinessJsonLd(content: string): LocalBusinessJsonLd | null {
    const matches = [
      ...content.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
    ];
    for (const m of matches) {
      try {
        const parsed = JSON.parse(m[1]!);
        const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (
            entry !== null &&
            typeof entry === "object" &&
            (entry as Record<string, unknown>)["@type"] === "LocalBusiness"
          ) {
            return entry as LocalBusinessJsonLd;
          }
        }
      } catch {
        // Ignore malformed JSON-LD blocks.
      }
    }
    return null;
  }

  private extractCityFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");
      if (parts.length >= 3 && parts[1] === "stadtbranchenbuch") {
        const subdomain = parts[0]!;
        if (subdomain !== "www") {
          return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
        }
      }
    } catch {
      // Ignore invalid URLs.
    }
    return null;
  }

  private extractStreetFromDom($: cheerio.CheerioAPI): string | null {
    const $dl = $("dl.address").first();
    if (!$dl.length) return null;
    return $dl.find("dd").first().find("span").first().text().trim() || null;
  }

  private extractPostalCodeFromDom($: cheerio.CheerioAPI): string | null {
    const $dl = $("dl.address").first();
    if (!$dl.length) return null;
    const candidates = $dl.find("dd").eq(1).find("span");
    for (let i = 0; i < candidates.length; i++) {
      const text = $(candidates[i]).text().trim();
      const match = text.match(/\b(\d{5})\b/);
      if (match) return match[1]!;
    }
    return null;
  }

  private extractCityFromDom($: cheerio.CheerioAPI): string | null {
    const $dl = $("dl.address").first();
    if (!$dl.length) return null;
    const $dd = $dl.find("dd").eq(1);
    const $inner = $dd.find("div").first();
    const spans = $inner.find("span");
    for (let i = spans.length - 1; i >= 0; i--) {
      const text = $(spans[i]).text().trim();
      if (text && !/^\d+\s*$/.test(text)) {
        return text;
      }
    }
    return null;
  }

  private extractPhoneFromDom($: cheerio.CheerioAPI): string | null {
    let phone: string | null = null;
    $("dl dt").each((_, dt): false | void => {
      if ($(dt).text().trim() === "Telefonnummer") {
        phone = $(dt).next("dd").find("span").first().text().trim() || null;
        return false;
      }
    });
    return phone;
  }

  private extractWebsiteUrlFromDom($: cheerio.CheerioAPI): string | null {
    // Pattern 1: link with class "homepage" (same as SERP parser)
    const homepageHref = $("a.homepage").first().attr("href")?.trim();
    if (homepageHref) return this.normalizeUrl(homepageHref);

    // Pattern 2: dl address block with "Webseite" or "Homepage" dt
    let url: string | null = null;
    $("dl dt").each((_, dt): false | void => {
      const dtText = $(dt).text().trim().toLowerCase();
      if (dtText === "webseite" || dtText === "homepage" || dtText === "website") {
        const dd = $(dt).next("dd");
        const href = dd.find("a").first().attr("href")?.trim();
        if (href) {
          url = href;
          return false;
        }
      }
    });
    if (url) return this.normalizeUrl(url);

    // Pattern 3: any anchor with rel="nofollow" that points to an external domain
    // (stadtbranchenbuch wraps external business links in nofollow anchors)
    // Filter out internal stadtbranchenbuch.com links to avoid extracting profile URLs as website URLs
    const externalHref = $('a[rel="nofollow"]').first().attr("href")?.trim();
    if (externalHref && /^https?:\/\//i.test(externalHref)) {
      try {
        const hostname = new URL(externalHref).hostname;
        if (!hostname.endsWith(".stadtbranchenbuch.com")) {
          return this.normalizeUrl(externalHref);
        }
      } catch {
        // Invalid URL — skip this pattern.
      }
    }

    return null;
  }

  private extractCategory($: cheerio.CheerioAPI): string | null {
    const $breadcrumbs = $("ol.breadcrumbs li.breadcrumb");
    if ($breadcrumbs.length >= 2) {
      const $catCrumb = $breadcrumbs.eq($breadcrumbs.length - 2);
      const catText = $catCrumb.text().trim();
      if (catText && catText.length > 2) {
        return catText.replace(/\s+(In|in)\s+.+$/, "").trim();
      }
    }

    let category: string | null = null;
    $("section.box").each((_, section): false | void => {
      if ($(section).find("h2").text().trim() === "Branchen") {
        category = $(section).find("span").first().text().trim() || null;
        return false;
      }
    });
    if (category) return category;

    const headlineSub = $(".headline-sub").first().clone();
    headlineSub.find("br, span").remove();
    const subText = headlineSub.text().trim();
    if (subText) return subText.split(/\s+/).slice(0, -1).join(" ").trim() || subText;

    return null;
  }

  private extractIdFromFilename(fileName: string): string {
    const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
    return base.replace(/\.html?$/i, "");
  }

  private normalizeUrl(raw: string | null | undefined): string | null {
    if (!raw || raw === "#" || raw.startsWith("javascript:")) return null;
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return `https://${trimmed}`;
  }
}
