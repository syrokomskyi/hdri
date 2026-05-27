/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for the branchenverzeichnis.org source.</purpose>
<keywords>parser, html, branchenverzeichnis, vcard, catalog</keywords>
<responsibilities>
  <item>Parses HTML vcard detail pages and category catalog pages from branchenverzeichnis.org using cheerio.</item>
  <item>Extracts business name, address, website, and category from vcard pages (hCard microformat + CategoryNavTrail breadcrumb).</item>
  <item>Extracts business name, vcard profile URL, website URL, and category from category catalog pages (CompanyEntryRow blocks + path-derived category).</item>
  <item>Uses the internal vcard ID as the sourceItemKey to allow downstream merging of catalog and vcard rows.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch live pages — operates only on pre-downloaded HTML content.</item>
  <item>Do not parse the site root index.php-N.html files — they contain only top-level category lists, no companies.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="BranchenverzeichnisParser">Class implementing SourceParser for branchenverzeichnis.org.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial parser implementation for branchenverzeichnis.org HTML pages.</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from 'cheerio';
import type { SourceParser } from './types.js';
import type { SourceBusinessSeed, SourceParseResult } from '../source-records.js';
import { isNoiseFile } from './noise-filter.js';

export class BranchenverzeichnisParser implements SourceParser {
  readonly sourceId = 'branchenverzeichnis.org';

  parse(content: string, fileName: string): SourceParseResult {
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];

    if (isNoiseFile(fileName)) {
      return { parserKind: 'branchenverzeichnis-ignored', items: [], warnings: [] };
    }

    const normalized = fileName.replace(/\\/g, '/');

    // vCard detail pages live at /infos/vcard/<id>/<slug>.html
    const isVcard = /\/infos\/vcard\/\d+\//.test(normalized);
    // Category catalog pages live at /infos/kategorie/<id>/<maincat>[/<subcat>]/index.htm(l)
    const isCatalog = /\/infos\/kategorie\/\d+\//.test(normalized);

    if (isVcard) {
      this.parseVcardPage(content, normalized, items, warnings);
    } else if (isCatalog) {
      this.parseCatalogPage(content, normalized, items, warnings);
    } else {
      // Site root pages, archive/info pages, etc. — no business records.
      return { parserKind: 'branchenverzeichnis-ignored', items: [], warnings: [] };
    }

    if (items.length === 0) {
      warnings.push(`No entries found in ${fileName}`);
    }

    return { parserKind: 'branchenverzeichnis-html', items, warnings };
  }

  private parseVcardPage(
    content: string,
    fileName: string,
    items: SourceBusinessSeed[],
    warnings: string[],
  ): void {
    const $ = cheerio.load(content);

    const vcardMatch = fileName.match(/\/infos\/vcard\/(\d+)\//);
    const vcardId = vcardMatch ? vcardMatch[1]! : 'unknown';
    const sourceItemKey = `bv_${vcardId}`;

    const $vcard = $('.vcard').first();
    if (!$vcard.length) {
      warnings.push(`No .vcard element found in ${fileName}`);
      return;
    }

    const businessName =
      $vcard.find('.org').first().text().trim() ||
      $vcard.find('.fn').first().text().trim() ||
      null;

    if (!businessName) {
      warnings.push(`No business name found in vcard ${fileName}`);
      return;
    }

    const streetAddress = $vcard.find('.street-address').first().text().trim() || null;
    const postalCode = $vcard.find('.postal-code').first().text().trim() || null;
    const city = $vcard.find('.locality').first().text().trim() || null;
    const phone = $vcard.find('.tel').first().text().trim() || null;
    const email = $vcard.find('.email').first().text().trim() || null;

    // Website link is rendered as <a id="vCardUrl-<id>" class="ExternalCount" href="http://...">
    let websiteUrl: string | null = null;
    const $extLink =
      $(`a#vCardUrl-${vcardId}`).first().length > 0
        ? $(`a#vCardUrl-${vcardId}`).first()
        : $('a.ExternalCount[href^="http"]').first();
    if ($extLink.length) {
      websiteUrl = this.normalizeUrl($extLink.attr('href'));
    }
    if (!websiteUrl) {
      const $urlA = $vcard.find('.url a').first();
      if ($urlA.length) websiteUrl = this.normalizeUrl($urlA.attr('href'));
    }

    // Category from breadcrumb: Startseite » <a>MainCat</a> » <strong>SubCat</strong>
    const category = this.extractCategoryFromBreadcrumb($);

    const sourceProfileUrl = `https://www.branchenverzeichnis.org/infos/vcard/${vcardId}/`;

    items.push({
      sourceItemKey,
      sourcePageNumber: null,
      businessName,
      streetAddress,
      postalCode,
      city,
      phone,
      email,
      websiteUrl,
      category,
      sourceProfileUrl,
      raw: {
        sourceFile: fileName,
        parserType: 'vcard',
      },
    });
  }

  private parseCatalogPage(
    content: string,
    fileName: string,
    items: SourceBusinessSeed[],
    warnings: string[],
  ): void {
    const $ = cheerio.load(content);

    // Category derived from path /infos/kategorie/<id>/<maincat>[/<subcat>]/
    const pathCategory = this.extractCategoryFromPath(fileName);

    let itemIndex = 0;
    $('div.CompanyEntryRow').each((_, el) => {
      itemIndex++;
      const $el = $(el);

      const $anchor = $el.find('h2 a').first();
      const businessName = $anchor.text().trim() || null;
      if (!businessName) {
        warnings.push(`Item ${itemIndex} in ${fileName}: no business name found`);
        return;
      }

      const href = $anchor.attr('href') || '';
      const idMatch = href.match(/\/infos\/vcard\/(\d+)\//);
      const vcardId = idMatch ? idMatch[1]! : null;
      const sourceItemKey = vcardId
        ? `bv_${vcardId}`
        : `bv_slug_${this.slugify(businessName)}_${itemIndex}`;

      const rawUrl = $el.find('.SmallDescription').first().text().trim();
      const websiteUrl = this.normalizeUrl(rawUrl);

      const description = $el.find('.CompanyDescription').first().text().trim() || null;

      const city =
        this.extractCityFromUrl(websiteUrl) ?? this.extractCityFromName(businessName);

      items.push({
        sourceItemKey,
        sourcePageNumber: null,
        businessName,
        streetAddress: null,
        postalCode: null,
        city,
        phone: null,
        email: null,
        websiteUrl,
        category: pathCategory,
        sourceProfileUrl: href || null,
        raw: {
          sourceFile: fileName,
          description,
          parserType: 'catalog',
        },
      });
    });
  }

  private extractCategoryFromBreadcrumb($: cheerio.CheerioAPI): string | null {
    const $trail = $('.CategoryNavTrail').first();
    if (!$trail.length) return null;
    const leaf = $trail.find('strong').last().text().trim();
    if (leaf) return leaf;
    const lastLink = $trail.find('a').last().text().trim();
    return lastLink || null;
  }

  private extractCategoryFromPath(fileName: string): string | null {
    // /infos/kategorie/<id>/<maincat>/<subcat>/index.htm  → "subcat" (slug)
    // /infos/kategorie/<id>/<maincat>/index.htm           → "maincat"
    const m = fileName.match(/\/infos\/kategorie\/\d+\/([^/]+)(?:\/([^/]+))?\/[^/]+$/);
    if (!m) return null;
    const leaf = (m[2] ?? m[1])!;
    return leaf.replace(/-/g, ' ');
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private extractCityFromName(name: string): string | null {
    const m = name.match(/[:,]\s*([A-Za-zÄÖÜäöüß][^,]+)$/);
    return m ? m[1]!.trim() : null;
  }

  private normalizeUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '#' || trimmed.startsWith('javascript:')) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('www.')) return `http://${trimmed}`;
    // Heuristic: looks like a bare domain (e.g. myLED.at)
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `http://${trimmed}`;
    return null;
  }

  private extractCityFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      for (const part of u.pathname.split('/')) {
        const m = part.match(/^([a-z]+)(?:-[a-z]+)$/i);
        if (m) {
          const city = m[1]!;
          return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
