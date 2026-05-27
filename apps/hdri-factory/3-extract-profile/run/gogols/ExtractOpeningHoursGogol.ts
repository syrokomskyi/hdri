/*
<MODULE_CONTRACT>
<purpose>Extracts opening hours from crawled pages and writes results to ext_opening_hours.</purpose>
<keywords>extract, opening hours, Öffnungszeiten, schema.org, JSON-LD, ext_opening_hours</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractOpeningHours() — tries JSON-LD first (source=jsonld), then text heuristics (source=text).</item>
  <item>Upsert one row per content_sha256 into ext_opening_hours.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages from the network — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_opening_hours.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractOpeningHoursGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as part of the CrawlAndExtractGogol split into focused single-responsibility gogols.</item>
  <item>Extends opening hours detection with text heuristics fallback in addition to JSON-LD.</item>
  <item>Fix CAS file path: replace path.dirname(getContentDir()) with getContentRootDir() so storage_path resolves correctly against outputRootDir.</item>
  <item>Rename 'extracted' counter to 'parsed' in log output and extract-report.json.</item>
  <item>Added progress counter logging every 1000 sites.</item>
  <item>Fix progress calculation to include skipped items so progress reaches 100%.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Refactor to ExtractGogolBase: adds concurrency, batch already-done check, batch upsert.</item>
  <item>Add csvColumns override to emit extracted-records.csv artifact.</item>
  <item>Migrate from extract(html, row) to extractDom($, row) to use shared DomCache.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from '@org/business-crawler/extract';
import { extractOpeningHours } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractOpeningHoursGogol extends ExtractGogolBase {
  override readonly id = 'extract-opening-hours';
  override readonly table = 'ext_opening_hours';

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const r = extractOpeningHours($);
    return [r.text, r.source, r.confidence];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'text', 'source', 'confidence']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_opening_hours (content_sha256, extractor_ver, text, source, confidence) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, text=excluded.text, source=excluded.source, confidence=excluded.confidence, extracted_at=unixepoch()`;
  }
}

