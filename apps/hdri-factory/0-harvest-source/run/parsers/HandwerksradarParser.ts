/*
<MODULE_CONTRACT>
<purpose>Independent CSV parser for the handwerksradar.com source.</purpose>
<keywords>parser, csv, handwerksradar</keywords>
<responsibilities>
  <item>Parses CSV content from handwerksradar.com into a standardized SourceParseResult.</item>
  <item>Maps specific CSV columns (Seite, Name, Straße, etc.) to SourceBusinessSeed fields.</item>
</responsibilities>
<non-goals>
  <item>Do not handle HTML formats or other sources.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="HandwerksradarParser">Class implementing SourceParser for handwerksradar.com.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename catalogId to sourceId and implement SourceParser.</item>
  <item>Refactor to use shared standardized CSV parsing logic.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from './types.js';
import type { SourceParseResult } from '../source-records.js';
import { parseStandardizedCsv } from './csv-shared.js';
import { isNoiseFile } from './noise-filter.js';

export class HandwerksradarParser implements SourceParser {
  readonly sourceId = 'handwerksradar.com';

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: 'handwerksradar-ignored', items: [], warnings: [] };
    }

    const { items, warnings } = parseStandardizedCsv(content, 'hr');
    return { parserKind: 'handwerksradar-csv', items, warnings };
  }
}
