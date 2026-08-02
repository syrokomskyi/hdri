/*
<MODULE_CONTRACT>
<purpose>Detects cookie-consent banners on crawled pages and writes results to ext_cookie_banner.</purpose>
<non-goals>
  <item>Do not fetch pages from the network — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_cookie_banner.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created as part of the CrawlAndExtractGogol split into focused single-responsibility gogols.</item>
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
import { extractCookieBanner } from "@syrokomskyi/business-crawler/extract";
import { ExtractGogolBase, type ObsRow } from "./ExtractGogolBase.js";

export class ExtractCookieBannerGogol extends ExtractGogolBase {
  override readonly id = "extract-cookie-banner";
  override readonly table = "ext_cookie_banner";

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const r = extractCookieBanner($);
    return [r.present ? 1 : 0, r.confidence, r.quality];
  }
  protected override get csvColumns(): string[] {
    return ["content_sha256", "present", "confidence", "quality"];
  }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_cookie_banner (content_sha256, extractor_ver, present, confidence, quality) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, confidence=excluded.confidence, quality=excluded.quality, extracted_at=unixepoch()`;
  }
}
