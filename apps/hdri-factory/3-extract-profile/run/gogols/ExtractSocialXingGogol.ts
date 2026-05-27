/*
<MODULE_CONTRACT>
<purpose>Detects Xing profile links on crawled pages and writes results to ext_social_xing.</purpose>
<keywords>extract, social, Xing, ext_social_xing</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractSocialXing() and upsert one row per content_sha256 into ext_social_xing.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_social_xing.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractSocialXingGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as a focused single-signal social link extraction gogol.</item>
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
import { extractSocialXing } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractSocialXingGogol extends ExtractGogolBase {
  override readonly id = 'extract-social-xing';
  override readonly table = 'ext_social_xing';

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const r = extractSocialXing($);
    return [r.present ? 1 : 0, r.url];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'present', 'url']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_social_xing (content_sha256, extractor_ver, present, url) VALUES (?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, url=excluded.url, extracted_at=unixepoch()`;
  }
}

