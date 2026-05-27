/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for SERP listing pages from stadtbranchenbuch.com subdomains.</purpose>
<keywords>parser, html, stadtbranchenbuch, serp, listing</keywords>
<responsibilities>
  <item>Parses SERP listing pages from city.stadtbranchenbuch.com — multiple companies per file.</item>
  <item>Extracts businesses from .serp-listing / .js-serp-listing elements.</item>
</responsibilities>
<non-goals>
  <item>Do not parse company detail pages.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="BacknangStadtbranchenbuchComParser">Class implementing SourceParser for backnang.stadtbranchenbuch.com SERP pages.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename StadtbranchenbuchSerpParser to BacknangStadtbranchenbuchComParser.</item>
  <item>Set sourceId to backnang.stadtbranchenbuch.com.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from 'cheerio';
import type { SourceParser } from './types.js';
import type { SourceBusinessSeed, SourceParseResult } from '../source-records.js';
import { isNoiseFile } from './noise-filter.js';

export class BacknangStadtbranchenbuchComParser implements SourceParser {
  /**
   * Specifically for the Backnang catalog as identified by the user.
   */
  readonly sourceId = 'backnang.stadtbranchenbuch.com';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'stadtbranchenbuch-serp-ignored', items: [], warnings: [] };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];
    let itemIndex = 0;

    const serpCity = this.extractCityFromUrl($('meta[property="og:url"]').attr('content') ?? null);

    $('.serp-listing, .js-serp-listing').each((_, el) => {
      itemIndex++;
      const $el = $(el);

      const name = $el.find('h3').first().text().trim() || null;
      const profileHref =
        $el.find('a[href*="stadtbranchenbuch"]').first().attr('href') ||
        $el.find('a').first().attr('href') ||
        null;
      const websiteUrl = $el.find('a.homepage').first().attr('href')
        ? this.normalizeUrl($el.find('a.homepage').first().attr('href') ?? null)
        : null;

      if (!name) {
        warnings.push(`SERP item ${itemIndex}: no name found`);
        return;
      }

      const $addr = $el.find('.address address, address').first();
      const streetAddress =
        $addr.find('span').first().text().trim() ||
        $el.find('address div').first().text().trim() ||
        null;
      const postalCode = $addr.find('span span').first().text().trim() || null;
      const cityText =
        $addr.find('span span').last().text().trim() ||
        $el.find('.categories span').first().text().replace(/\s+\S+$/, '').trim() ||
        null;

      const categoryRaw = $el.find('.categories span').first().text().trim();
      const category = categoryRaw
        ? categoryRaw.replace(/\s+[A-ZÄÖÜ][a-zäöü]+.*$/, '').trim() || categoryRaw
        : $el.find('.infos div span').first().text().trim() || null;

      const listingId = $el.attr('data-listing-id') ?? `${itemIndex}`;

      items.push({
        sourceItemKey: `sbb_${listingId}`,
        sourcePageNumber: null,
        businessName: name,
        streetAddress,
        postalCode,
        city: cityText ?? serpCity,
        phone: $el.find('.phone').first().text().trim() || null,
        email: null,
        websiteUrl,
        category,
        sourceProfileUrl: profileHref ?? null,
        raw: { sourceFile: fileName },
      });
    });

    return { parserKind: 'stadtbranchenbuch-serp-html', items, warnings };
  }

  private extractCityFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.');
      if (parts.length >= 3 && parts[1] === 'stadtbranchenbuch') {
        const subdomain = parts[0]!;
        if (subdomain !== 'www') {
          return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
        }
      }
    } catch {
      // Ignore invalid URLs.
    }
    return null;
  }

  private normalizeUrl(raw: string | null | undefined): string | null {
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return null;
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return `https://${trimmed}`;
  }
}
