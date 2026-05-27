/*
<MODULE_CONTRACT>
<purpose>Independent HTML parser for the firmenabc.com source.</purpose>
<keywords>parser, html, firmenabc</keywords>
<responsibilities>
  <item>Parses HTML listing pages from firmenabc.com using cheerio.</item>
  <item>Identifies external website URLs and source profile links.</item>
</responsibilities>
<non-goals>
  <item>Do not handle other sources or CSV formats.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="FirmenAbcParser">Class implementing SourceParser for firmenabc.com.</entry>
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

export class FirmenAbcParser implements SourceParser {
  readonly sourceId = 'firmenabc.com';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'firmenabc-ignored', items: [], warnings: [] };
    }

    // Detect CSV by extension or first line
    if (fileName.endsWith('.csv') || content.trimStart().startsWith('Seite,Name,')) {
      const { items, warnings } = parseStandardizedCsv(content, 'fabc');
      return { parserKind: 'firmenabc-csv', items, warnings };
    }

    const $ = cheerio.load(content);
    const items: SourceBusinessSeed[] = [];
    const warnings: string[] = [];
    let itemIndex = 0;

    $('.listing, .entry').each((_, el) => {
      itemIndex++;
      const $el = $(el);
      const name = $el.find('h3, .name').first().text().trim() || null;
      const websiteUrl = $el.find('a[href^="http"]').filter((_, a) => !$(a).attr('href')?.includes('firmenabc.com')).first().attr('href') || null;

      if (!websiteUrl) {
        warnings.push(`Item ${itemIndex}: no external website URL`);
        return;
      }

      items.push({
        sourceItemKey: `fabc_${itemIndex}`,
        sourcePageNumber: null,
        businessName: name,
        streetAddress: null, // Placeholder, would need specific selectors
        postalCode: null,
        city: null,
        phone: null,
        email: null,
        websiteUrl,
        category: null,
        sourceProfileUrl: $el.find('a[href*="firmenabc.com"]').first().attr('href') || null,
        raw: { sourceFile: fileName },
      });
    });

    return { parserKind: 'firmenabc-html', items, warnings };
  }
}
