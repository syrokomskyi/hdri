/*
<MODULE_CONTRACT>
<purpose>Detects Schema.org OpeningHoursSpecification markup in crawled pages and writes results to ext_schema_opening_hours_spec.</purpose>
<non-goals>
  <item>Do not fetch pages — that is CrawlGogol's responsibility.</item>
  <item>Do not extract opening hours text — that is ExtractOpeningHoursGogol's responsibility.</item>
  <item>Do not write to any table other than ext_schema_opening_hours_spec.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created as a focused single-signal Schema.org extraction gogol.</item>
  <item>Fix CAS file path: replace path.dirname(getContentDir()) with getContentRootDir() so storage_path resolves correctly against outputRootDir.</item>
  <item>Rename 'extracted' counter to 'parsed' in log output and extract-report.json.</item>
  <item>Added progress counter logging every 1000 sites.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Refactor to ExtractGogolBase: adds concurrency, batch already-done check, batch upsert.</item>
  <item>Add csvColumns override to emit extracted-records.csv artifact.</item>
  <item>Migrate from extract(html, row) to extractDom($, row) to use shared DomCache.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "@syrokomskyi/business-crawler/extract";
import { extractSchemaOpeningHoursSpec } from "@syrokomskyi/business-crawler/extract";
import { ExtractGogolBase, type ObsRow } from "./ExtractGogolBase.js";

export class ExtractSchemaOpeningHoursSpecGogol extends ExtractGogolBase {
  override readonly id = "extract-schema-opening-hours-spec";
  override readonly table = "ext_schema_opening_hours_spec";

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    return [extractSchemaOpeningHoursSpec($).present ? 1 : 0];
  }
  protected override get csvColumns(): string[] {
    return ["content_sha256", "present"];
  }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_schema_opening_hours_spec (content_sha256, extractor_ver, present) VALUES (?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, extracted_at=unixepoch()`;
  }
}
