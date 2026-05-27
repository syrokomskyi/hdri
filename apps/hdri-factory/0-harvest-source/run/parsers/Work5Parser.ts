/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for the work5.de source.</purpose>
<keywords>parser, html, work5, dienstleister</keywords>
<responsibilities>
  <item>Parses HTML service-provider profile pages from work5.de using cheerio.</item>
  <item>Extracts business name, address, postal code, city, category and website URL from /dienstleister/ pages.</item>
  <item>Generates a unique sourceItemKey based on the canonical og:url or filename.</item>
</responsibilities>
<non-goals>
  <item>Do not handle other sources or CSV formats.</item>
  <item>Do not fetch live pages — operates only on pre-downloaded HTML content.</item>
  <item>Do not parse /auftraege/ (job requests), /profile/ (user profiles), /kategorien/, /ratgeber/, /blog/, /tools/ — they don't represent businesses.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Work5Parser">Class implementing SourceParser for work5.de.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial parser implementation for work5.de service-provider detail pages.</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from 'cheerio';
import type { SourceParser } from './types.js';
import type { SourceBusinessSeed, SourceParseResult } from '../source-records.js';
import { isNoiseFile } from './noise-filter.js';

export class Work5Parser implements SourceParser {
  readonly sourceId = 'work5.de';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'work5-ignored', items: [], warnings: [] };
    }

    const normalized = fileName.replace(/\\/g, '/');
    if (!/\/dienstleister\/[^/]+\.html?$/i.test(normalized)) {
      // Only service-provider detail pages carry business data.
      return { parserKind: 'work5-ignored', items: [], warnings: [] };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];

    const canonicalUrl = $('meta[property="og:url"]').attr('content') || null;

    // Stable key from canonical URL slug or filename slug.
    let sourceItemKey = '';
    if (canonicalUrl) {
      const m = canonicalUrl.match(/\/([^/]+)$/);
      if (m) sourceItemKey = `work5_${m[1]}`;
    }
    if (!sourceItemKey) {
      const base = normalized.split('/').pop() ?? '';
      sourceItemKey = `work5_${base.replace(/\.html?$/i, '')}`;
    }

    // Business name: h1.entity-title is the canonical display name.
    let businessName = $('h1.entity-title').first().text().trim();
    if (!businessName) {
      // Fallback: parse "Name, City | Username" pattern from og:title / <title>.
      const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
      const namePart = ogTitle.split('|')[0]?.trim() ?? '';
      businessName = namePart.split(',')[0]?.trim() ?? '';
    }

    if (!businessName) {
      warnings.push(`No business name found in ${fileName}`);
      return { parserKind: 'work5-html', items, warnings };
    }

    // Address — prefer the structured #address block, fall back to the inline <address>.
    let streetAddress: string | null = null;
    let postalCode: string | null = null;
    let city: string | null = null;

    const $structured = $('#address address').first();
    if ($structured.length) {
      // Children: optionally [name], street, "PLZ City", "Country" (text-muted).
      const lines = $structured
        .find('div')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 0);
      for (const line of lines) {
        const zipMatch = line.match(/^(\d{5})\s+(.+)$/);
        if (zipMatch && !postalCode) {
          postalCode = zipMatch[1] ?? null;
          city = zipMatch[2]!.trim();
          continue;
        }
        if (/^Deutschland$|^Germany$|^Österreich$|^Schweiz$/i.test(line)) continue;
        if (line === businessName) continue;
        // First non-name, non-zip, non-country line is the street.
        if (!streetAddress) streetAddress = line;
      }
    }

    if (!city) {
      // Inline header address: "Street, PLZ City, Land"
      const inline = $('address').first().text().trim();
      const inlineMatch = inline.match(/(\d{5})\s+([^,]+)/);
      if (inlineMatch) {
        postalCode = postalCode ?? inlineMatch[1] ?? null;
        city = inlineMatch[2]!.trim();
      }
    }

    if (!city) {
      // Last resort: og:title format "Name, City | Username".
      const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
      const beforePipe = ogTitle.split('|')[0] ?? '';
      const parts = beforePipe.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) city = parts[parts.length - 1] ?? null;
    }

    // Category — first .category-item is the primary category.
    const $cat = $('.category-display .category-item').first();
    let category: string | null = null;
    if ($cat.length) {
      const main = $cat.find('.category-main').first().text().trim();
      const sub = $cat.find('.category-sub').first().text().trim();
      category = main && sub ? `${main} - ${sub}` : sub || main || null;
    }

    // Website — look in the #web section for any external (non-work5) http link.
    let websiteUrl: string | null = null;
    $('#web a[href^="http"]').each((_, el) => {
      if (websiteUrl) return;
      const href = $(el).attr('href');
      if (href && !/work5\.de/i.test(href)) websiteUrl = href;
    });

    const description = $('.description-content').first().text().trim() || null;

    items.push({
      sourceItemKey,
      sourcePageNumber: null,
      businessName,
      streetAddress,
      postalCode,
      city,
      phone: null,
      email: null,
      websiteUrl: websiteUrl ? this.normalizeUrl(websiteUrl) : null,
      category,
      sourceProfileUrl: canonicalUrl,
      raw: {
        sourceFile: fileName,
        description,
      },
    });

    return { parserKind: 'work5-html', items, warnings };
  }

  private normalizeUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '#' || trimmed.startsWith('javascript:')) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return `https://${trimmed}`;
  }
}
