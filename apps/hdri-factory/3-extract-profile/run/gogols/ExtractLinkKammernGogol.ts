/*
<MODULE_CONTRACT>
<purpose>Detects links to IHK/HWK chamber websites on crawled pages and writes results to ext_link_kammern.</purpose>
<keywords>extract, Kammern, IHK, HWK, Handwerkskammer, external link, ext_link_kammern</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractLinkKammern() and upsert one row per content_sha256 into ext_link_kammern.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages — that is CrawlGogol's responsibility.</item>
  <item>Do not perform HTTP HEAD checks — presence of href is sufficient.</item>
  <item>Do not write to any table other than ext_link_kammern.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractLinkKammernGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as a focused single-signal external link extraction gogol.</item>
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
import { extractLinkKammern } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractLinkKammernGogol extends ExtractGogolBase {
  override readonly id = 'extract-link-kammern';
  override readonly table = 'ext_link_kammern';

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const r = extractLinkKammern($);
    return [r.present ? 1 : 0, r.url];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'present', 'url']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_link_kammern (content_sha256, extractor_ver, present, url) VALUES (?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, url=excluded.url, extracted_at=unixepoch()`;
  }
}

