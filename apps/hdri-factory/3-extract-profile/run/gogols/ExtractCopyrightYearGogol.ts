/*
<MODULE_CONTRACT>
<purpose>Extracts copyright year from crawled pages and writes results to ext_copyright_year.</purpose>
<keywords>extract, copyright year, footer, ext_copyright_year</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractCopyrightYear() and upsert one row per content_sha256 into ext_copyright_year.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages from the network — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_copyright_year.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractCopyrightYearGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as part of the CrawlAndExtractGogol split into focused single-responsibility gogols.</item>
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
import { extractCopyrightYear } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractCopyrightYearGogol extends ExtractGogolBase {
  override readonly id = 'extract-copyright-year';
  override readonly table = 'ext_copyright_year';

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    return [extractCopyrightYear($).year];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'year']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_copyright_year (content_sha256, extractor_ver, year) VALUES (?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, year=excluded.year, extracted_at=unixepoch()`;
  }
}

