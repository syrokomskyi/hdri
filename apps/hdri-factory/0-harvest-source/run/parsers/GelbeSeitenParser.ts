/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for the gelbeseiten.de source.</purpose>
<keywords>parser, html, gelbeseiten</keywords>
<responsibilities>
  <item>Parses HTML listing pages from gelbeseiten.de using cheerio.</item>
  <item>Extracts business names, addresses, phones, and websites from GS-specific elements.</item>
</responsibilities>
<non-goals>
  <item>Do not handle other sources or CSV formats.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="GelbeSeitenParser">Class implementing SourceParser for gelbeseiten.de.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename catalogId to sourceId and implement SourceParser.</item>
  <item>Add support for standardized CSV format.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
</CHANGE_SUMMARY>
*/

import * as cheerio from 'cheerio';
import type { SourceParser } from './types.js';
import type { SourceBusinessSeed, SourceParseResult } from '../source-records.js';
import { parseStandardizedCsv } from './csv-shared.js';
import { isNoiseFile } from './noise-filter.js';

export class GelbeSeitenParser implements SourceParser {
  readonly sourceId = 'gelbeseiten.de';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'gelbeseiten-ignored', items: [], warnings: [] };
    }

    // Detect CSV by extension or first line
    if (fileName.endsWith('.csv') || content.trimStart().startsWith('Seite,Name,')) {
      const { items, warnings } = parseStandardizedCsv(content, 'gs');
      return { parserKind: 'gelbeseiten-csv', items, warnings };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];
    let itemIndex = 0;

    // Specific GelbeSeiten selectors
    $('article.result, .serp-listing').each((_, el) => {
      itemIndex++;
      const $el = $(el);

      const name = $el.find('h2, h3').first().text().trim() || null;
      const websiteUrl = this.normalizeUrl($el.find('a.homepage, a[data-follow-link]').first().attr('href') || null);

      if (!websiteUrl) {
        warnings.push(`Item ${itemIndex}: no website URL`);
        return;
      }

      items.push({
        sourceItemKey: `gs_${itemIndex}`,
        sourcePageNumber: null,
        businessName: name,
        streetAddress: $el.find('address div').first().text().trim() || null,
        postalCode: $el.find('address span').first().text().trim() || null,
        city: $el.find('address span').eq(1).text().trim() || null,
        phone: $el.find('.phone').first().text().trim() || null,
        email: null,
        websiteUrl,
        category: $el.find('.infos div span').first().text().trim() || null,
        sourceProfileUrl: $el.find('a[href*="gelbeseiten.de/gs/"]').first().attr('href') || null,
        raw: { sourceFile: fileName },
      });
    });

    if (items.length === 0) warnings.push(`No GS listings found in ${fileName}`);
    return { parserKind: 'gelbeseiten-html', items, warnings };
  }

  private normalizeUrl(raw: string | null): string | null {
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw.replace(/^\/\//, '')}`;
  }
}
