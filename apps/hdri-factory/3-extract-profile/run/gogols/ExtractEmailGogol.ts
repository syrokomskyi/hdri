/*
<MODULE_CONTRACT>
<purpose>Extracts email addresses from crawled pages and writes results to ext_email.</purpose>
<keywords>extract, email, E-Mail, ext_email</keywords>
<responsibilities>
  <item>Iterate over page_observations for the current batch joined with page_contents.</item>
  <item>Read each HTML file from CAS storage on disk.</item>
  <item>Call extractPageSignals() and extract email counts, upsert one row per content_sha256 into ext_email.</item>
  <item>Write extract-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Does not fetch pages from the network — that is CrawlGogol's responsibility.</item>
  <item>Does not write to any table other than ext_email.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExtractEmailGogol.run">Main extraction loop over page_observations for the current batch.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: extract email addresses from HTML and store count in ext_email.</item>
  <item>Added progress counter logging every 1000 sites.</item>
  <item>Fix progress calculation to include skipped items so progress reaches 100%.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Refactor to ExtractGogolBase: adds concurrency, batch already-done check, batch upsert.</item>
  <item>Add csvColumns override to emit extracted-records.csv artifact.</item>
  <item>Migrate from extract(html, row) to extractDom($, row) to use shared DomCache.</item>
  <item>Fix idempotency: add WHERE sp.source = 'homepage' to querySql so only homepage observations are processed.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from '@org/business-crawler/extract';
import { extractPageSignals } from '@org/business-crawler/extract';
import { ExtractGogolBase, type ObsRow } from './ExtractGogolBase.js';

export class ExtractEmailGogol extends ExtractGogolBase {
  override readonly id = 'extract-email';
  override readonly table = 'ext_email';

  protected override get querySql(): string {
    return `SELECT po.content_sha256, pc.storage_path, sp.url_norm FROM page_observations po JOIN page_contents pc ON pc.sha256 = po.content_sha256 JOIN site_pages sp ON sp.id = po.site_page_id WHERE sp.source = 'homepage'`;
  }

  protected override extractDom($: CheerioAPI, row: ObsRow): unknown[] | null {
    const signals = extractPageSignals($, row.url_norm!);
    const count = signals.emails.length;
    return [count > 0 ? 1 : 0, count];
  }
  protected override get csvColumns(): string[] { return ['content_sha256', 'present', 'count']; }
  protected override get upsertSql(): string {
    return `INSERT INTO ext_email (content_sha256, extractor_ver, present, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(content_sha256, extractor_ver) DO UPDATE SET extractor_ver=excluded.extractor_ver, present=excluded.present, count=excluded.count, extracted_at=unixepoch()`;
  }

  protected override afterProcessResults(results: Array<{ sha256: string; params: unknown[] }>): Record<string, unknown> {
    return { totalEmails: results.reduce((sum, r) => sum + (r.params[1] as number), 0) };
  }
}

