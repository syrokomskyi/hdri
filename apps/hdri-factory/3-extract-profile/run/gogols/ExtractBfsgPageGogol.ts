/*
<MODULE_CONTRACT>
<purpose>Detects Barrierefreiheitserklärung (BFSG accessibility statement) links on crawled pages and writes results to ext_bfsg_page.</purpose>
<keywords>extract, BFSG, Barrierefreiheit, accessibility, legal, ext_bfsg_page</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents and site_pages.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractBfsgPage() and upsert one row per content_sha256 into ext_bfsg_page.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Do not fetch pages — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_bfsg_page.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractBfsgPageGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created as a focused single-signal legal page extraction gogol.</item>
  <item>Fix CAS file path: replace path.dirname(getContentDir()) with getContentRootDir() so storage_path resolves correctly against outputRootDir.</item>
  <item>Rename 'extracted' counter to 'parsed' in log output and extract-report.json.</item>
  <item>Added progress counter logging every 1000 sites.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Refactor to ExtractGogolBase: adds concurrency, batch already-done check, batch upsert.</item>
  <item>Add csvColumns override to emit extracted-records.csv artifact.</item>
  <item>Migrate from extract(html, row) to extractDom($, row) to use shared DomCache.</item>
  <item>Fix idempotency: add WHERE sp.source = 'homepage' to querySql so only homepage observations are processed.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from '@org/business-crawler/extract';
import { extractBfsgPage } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractBfsgPageGogol extends ExtractGogolBase {
  override readonly id = 'extract-bfsg-page';
  override readonly table = 'ext_bfsg_page';

  protected override get querySql(): string {
    return `SELECT po.content_sha256, pc.storage_path, sp.url_norm FROM page_observations po JOIN page_contents pc ON pc.sha256 = po.content_sha256 JOIN site_pages sp ON sp.id = po.site_page_id WHERE sp.source = 'homepage'`;
  }

  protected override extractDom($: CheerioAPI, row: ObsRow): unknown[] | null {
    const r = extractBfsgPage($, row.url_norm!);
    return [r.present ? 1 : 0, r.url, r.confidence];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'present', 'url', 'confidence']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_bfsg_page (content_sha256, extractor_ver, present, url, confidence) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, url=excluded.url, confidence=excluded.confidence, extracted_at=unixepoch()`;
  }
}

