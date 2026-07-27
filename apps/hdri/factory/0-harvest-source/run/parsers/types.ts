/*
<MODULE_CONTRACT>
<purpose>Defines the contract for independent source-specific parsers — this module handles types operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement any parsing logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rename CatalogParser to SourceParser for better universality.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParseResult } from "../source-records.js";

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
