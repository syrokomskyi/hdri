/*
<MODULE_CONTRACT>
<purpose>Detects case study links on crawled pages and writes results to ext_case_studies.</purpose>
<keywords>extract, case studies, Fallstudie, Kundenprojekt, ext_case_studies</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractCaseStudies() and upsert one row per content_sha256 into ext_case_studies.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages — that is CrawlGogol's responsibility.</item>
  <item>Do not detect generic portfolio/gallery — that is ExtractPortfolioGogol's responsibility.</item>
  <item>Do not write to any table other than ext_case_studies.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractCaseStudiesGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as a focused single-signal content extraction gogol.</item>
  <item>Fix CAS file path: replace path.dirname(getContentDir()) with getContentRootDir() so storage_path resolves correctly against outputRootDir.</item>
  <item>Rename 'extracted' counter to 'parsed' in log output and extract-report.json.</item>
  <item>Added progress counter logging every 1000 sites.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Refactor to ExtractGogolBase: adds concurrency, batch already-done check, batch upsert.</item>
  <item>Add csvColumns override to emit extracted-records.csv artifact.</item>
  <item>Migrate from extract(html, row) to extractDom($, row) to use shared DomCache.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from '@org/business-crawler/extract';
import { extractCaseStudies } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractCaseStudiesGogol extends ExtractGogolBase {
  override readonly id = 'extract-case-studies';
  override readonly table = 'ext_case_studies';

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const r = extractCaseStudies($);
    return [r.present ? 1 : 0, r.confidence];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'present', 'confidence']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_case_studies (content_sha256, extractor_ver, present, confidence) VALUES (?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, confidence=excluded.confidence, extracted_at=unixepoch()`;
  }
}

