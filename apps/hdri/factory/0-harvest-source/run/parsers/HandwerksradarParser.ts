/*
<MODULE_CONTRACT>
<purpose>Independent CSV parser for the handwerksradar.com source — this module handles handwerksradar parser operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not handle HTML formats or other sources.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Rename catalogId to sourceId and implement SourceParser.</item>
  <item>Refactor to use shared standardized CSV parsing logic.</item>
  <item>Ignore noise files (favicons, technical artifacts).</item>
</CHANGE_SUMMARY>
*/

import type { SourceParser } from "./types.js";
import type { SourceParseResult } from "../source-records.js";
import { parseStandardizedCsv } from "./csv-shared.js";
import { isNoiseFile } from "./noise-filter.js";

export class HandwerksradarParser implements SourceParser {
  readonly sourceId = "handwerksradar.com";

  parse(content: string, fileName: string): SourceParseResult {
    if (isNoiseFile(fileName)) {
      return { parserKind: "handwerksradar-ignored", items: [], warnings: [] };
    }

    const { items, warnings } = parseStandardizedCsv(content, "hr");
    return { parserKind: "handwerksradar-csv", items, warnings };
  }
}
