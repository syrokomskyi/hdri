/*
<MODULE_CONTRACT>
<purpose>Fallback parser for unknown or unregistered sources — this module handles unknown source parser operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not attempt to guess the format.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rename UnknownCatalogParser to UnknownSourceParser.</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from "./types.js";
import type { SourceParseResult } from "../source-records.js";

/**
 * Fallback parser used when no specific parser is registered for a source.
 * Returns empty results with a warning.
 */
export class UnknownSourceParser implements SourceParser {
  constructor(public readonly sourceId: string) {}

  parse(_content: string, fileName: string): SourceParseResult {
    return {
      parserKind: "unknown",
      items: [],
      warnings: [
        `No specific parser registered for source "${this.sourceId}". Skipping file ${fileName}.`,
      ],
    };
  }
}
