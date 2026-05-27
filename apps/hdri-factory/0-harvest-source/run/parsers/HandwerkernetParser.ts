/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for the handwerkernet.de source.</purpose>
<keywords>parser, html, handwerkernet, schema.org, LocalBusiness</keywords>
<responsibilities>
  <item>Parses HTML listing pages from handwerkernet.de using cheerio.</item>
  <item>
    Extracts business name, website URL, description, street address, postal code,
    and city from Schema.org LocalBusiness microdata embedded in each listing page.
  </item>
  <item>
    Derives the trade category (Branche) from the parent directory segment of the
    file path (e.g. "dachdecker" from "handwerker_firmen/dachdecker/page.html").
  </item>
  <item>
    Derives the source page number from the filename suffix
    (e.g. "dachdecker_handwerkernet_002.html" → page 2; "index.html" → page 1).
  </item>
</responsibilities>
<non-goals>
  <item>Do not handle other sources or CSV formats.</item>
  <item>Do not fetch live pages — operates only on pre-downloaded HTML content.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="HandwerkernetParser">Class implementing SourceParser for handwerkernet.de.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Create initial implementation of HandwerkernetParser for handwerkernet.de HTML parsing.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
  <item>Verify city extraction from addressLocality and category from directory path working correctly.</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from 'cheerio';
import type { SourceParser } from './types.js';
import type { SourceBusinessSeed, SourceParseResult } from '../source-records.js';
import { isNoiseFile } from './noise-filter.js';

/**
 * Handwerkernet.de pages embed Schema.org LocalBusiness microdata for every
 * company entry. Each listing page lives under a category subdirectory
 * (e.g. handwerker_firmen/dachdecker/) and contains ~10 entries per page.
 *
 * Selector reference:
 *   [itemtype="https://schema.org/LocalBusiness"]  – one per company
 *     [itemprop="name"]                            – company name
 *     [itemprop="url"]   href attr                 – company website
 *     [itemprop="description"]                     – short description / trade
 *     [itemprop="streetAddress"]                   – street + house number
 *     [itemprop="postalCode"]                      – PLZ (5 digits)
 *     [itemprop="addressLocality"]                 – city
 */
export class HandwerkernetParser implements SourceParser {
  readonly sourceId = 'handwerkernet.de';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'handwerkernet-ignored', items: [], warnings: [] };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];
    let itemIndex = 0;

    // Derive trade category from the directory segment before the filename.
    // fileName is the relative path inside the source folder, e.g.:
    //   "handwerkernet.de/handwerker_firmen/dachdecker/dachdecker_handwerkernet_002.html"
    // We want the last directory segment before the basename.
    const category = this.extractCategory(fileName);

    // Derive page number from the filename suffix (e.g. "_002" → "2").
    const sourcePageNumber = this.extractPageNumber(fileName);

    $('[itemtype="https://schema.org/LocalBusiness"]').each((_, el) => {
      itemIndex++;
      const $el = $(el);

      // Company name – prefer the span with itemprop="name" inside the anchor.
      const businessName =
        $el.find('[itemprop="name"]').first().text().trim() || null;

      if (!businessName) {
        warnings.push(`Item ${itemIndex} in ${fileName}: no business name found`);
        return;
      }

      // Website URL – from the href of the anchor that wraps the name.
      const rawUrl =
        $el.find('[itemprop="url"]').attr('href') ||
        $el.find('.url a').attr('href') ||
        null;
      const websiteUrl = this.normalizeUrl(rawUrl);

      // Description / trade statement.
      const description =
        $el.find('[itemprop="description"]').first().text().trim() || null;

      // Address fields – all inside the PostalAddress nested block.
      const streetAddress =
        $el.find('[itemprop="streetAddress"]').first().text().trim() || null;
      const postalCode =
        $el.find('[itemprop="postalCode"]').first().text().trim() || null;
      const city =
        $el.find('[itemprop="addressLocality"]').first().text().trim() || null;

      // Stable key: PLZ + name slug (no internal IDs available on this site).
      const slug = (businessName ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const sourceItemKey = `hn_${postalCode ?? 'xx'}_${slug}_${itemIndex}`;

      items.push({
        sourceItemKey,
        sourcePageNumber,
        businessName,
        streetAddress,
        postalCode,
        city,
        phone: null,      // not present on listing pages
        email: null,      // not present on listing pages
        websiteUrl,
        category: category ?? description,
        sourceProfileUrl: null, // no handwerkernet.de profile URL on these pages
        raw: {
          sourceFile: fileName,
          description,
        },
      });
    });

    if (items.length === 0) {
      warnings.push(`No handwerkernet.de LocalBusiness entries found in ${fileName}`);
    }

    return { parserKind: 'handwerkernet-html', items, warnings };
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  /**
   * Extracts the trade category from the directory segment of the file path.
   *
   * Examples:
   *   "handwerkernet.de/handwerker_firmen/dachdecker/page.html"  → "dachdecker"
   *   "handwerkernet.de/handwerker_firmen/elektrohandwerk/x.html" → "elektrohandwerk"
   *   "handwerkernet.de/index.htm"                               → null
   */
  private extractCategory(fileName: string): string | null {
    // Normalize separators.
    const normalized = fileName.replace(/\\/g, '/');
    const parts = normalized.split('/');
    // The last segment is the filename; the second-to-last is the directory.
    if (parts.length >= 2) {
      const dir = parts[parts.length - 2];
      // Ignore top-level source folder names and the "handwerker_firmen" container.
      if (dir && dir !== 'handwerkernet.de' && dir !== 'handwerker_firmen') {
        return dir;
      }
    }
    return null;
  }

  /**
   * Extracts a 1-based page number string from the filename.
   *
   * Pattern: "dachdecker_handwerkernet_002.html" → "2"
   * Fallback: "index.html" → "1"
   */
  private extractPageNumber(fileName: string): string | null {
    const base = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
    const match = base.match(/_(\d+)\.html$/i);
    if (match) {
      return String(parseInt(match[1]!, 10)); // strip leading zeros
    }
    if (/^index\.html?$/i.test(base)) {
      return '1';
    }
    return null;
  }

  /**
   * Normalises an href to an absolute https:// URL.
   */
  private normalizeUrl(raw: string | null | undefined): string | null {
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return null;
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return `https://${trimmed}`;
  }
}
