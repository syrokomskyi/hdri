/*
<MODULE_CONTRACT>
<purpose>Defines the contract for independent source-specific parsers.</purpose>
<keywords>parser, interface, source, extraction</keywords>
<responsibilities>
  <item>Provides a common interface for all parsers (catalogs, providers, etc.).</item>
</responsibilities>
<non-goals>
  <item>Do not implement any parsing logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SourceParser">Contract for a source-specific parser.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Rename CatalogParser to SourceParser for better universality.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParseResult } from '../source-records.js';

/**
 * Contract for a source-specific parser (e.g. catalog, data provider).
 */
export interface SourceParser {
  /**
   * The source identifier (folder name).
   */
  readonly sourceId: string;

  /**
   * Parse the content of a single file from this source.
   */
  parse(content: string, fileName: string): SourceParseResult;
}
