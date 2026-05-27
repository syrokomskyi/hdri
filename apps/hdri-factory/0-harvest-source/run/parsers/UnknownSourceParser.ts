/*
<MODULE_CONTRACT>
<purpose>Fallback parser for unknown or unregistered sources.</purpose>
<keywords>parser, fallback, unknown source</keywords>
<responsibilities>
  <item>Returns a warning and empty results when no specific parser is found for a source.</item>
</responsibilities>
<non-goals>
  <item>Do not attempt to guess the format.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="UnknownSourceParser">Fallback implementation of SourceParser.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename UnknownCatalogParser to UnknownSourceParser.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from './types.js';
import type { SourceParseResult } from '../source-records.js';

/**
 * Fallback parser used when no specific parser is registered for a source.
 * Returns empty results with a warning.
 */
export class UnknownSourceParser implements SourceParser {
  constructor(public readonly sourceId: string) {}

  parse(_content: string, fileName: string): SourceParseResult {
    return {
      parserKind: 'unknown',
      items: [],
      warnings: [`No specific parser registered for source "${this.sourceId}". Skipping file ${fileName}.`],
    };
  }
}
