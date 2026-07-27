/*
<MODULE_CONTRACT>
<purpose>Extracts datenschutz (privacy policy) signal from crawled pages and writes results to ext_datenschutz.</purpose>
<non-goals>
  <item>Do not fetch pages from the network — that is CrawlGogol's responsibility.</item>
  <item>Do not write to any table other than ext_datenschutz.</item>
</non-goals>
</MODULE_CONTRACT>
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
  <item>Fix idempotency: add WHERE sp.source = 'homepage' to querySql so only homepage observations are processed.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import { type CheerioAPI } from "@syrokomskyi/business-crawler/extract";
import { extractDatenschutz } from "@syrokomskyi/business-crawler/extract";
import { ExtractGogolBase, type ObsRow } from "./ExtractGogolBase.js";

export class ExtractDatenschutzGogol extends ExtractGogolBase {
  override readonly id = "extract-datenschutz";
  override readonly table = "ext_datenschutz";

  protected override get querySql(): string {
    return `SELECT po.content_sha256, pc.storage_path, sp.url_norm FROM page_observations po JOIN page_contents pc ON pc.sha256 = po.content_sha256 JOIN site_pages sp ON sp.id = po.site_page_id WHERE sp.source = 'homepage'`;
  }

  protected override extractDom($: CheerioAPI, row: ObsRow): unknown[] | null {
    const r = extractDatenschutz($, row.url_norm!);
    return [r.present ? 1 : 0, r.url, r.confidence];
  }
  protected override get csvColumns(): string[] {
    return ["content_sha256", "present", "url", "confidence"];
  }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_datenschutz (content_sha256, extractor_ver, present, url, confidence) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, url=excluded.url, confidence=excluded.confidence, extracted_at=unixepoch()`;
  }
}
