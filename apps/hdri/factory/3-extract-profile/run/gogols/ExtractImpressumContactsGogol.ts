/*
<MODULE_CONTRACT>
<purpose>Extracts Impressum contact details (names, address, phone, email, USt-IdNr) into the factory-local ext_impressum_contacts table.</purpose>
<non-goals>
  <item>PRIVACY: never writes to any table bridged into observations. ext_impressum_contacts has no entry in EXT_SIGNAL_MAP, so this data can never reach HDRI / the published dashboard. (Locked by a regression test in @syrokomskyi/observatory-core.)</item>
  <item>Does not fetch pages from the network — FetchDetectedPagesGogol already fetched the Impressum page.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP5: collect Impressum names/contacts at crawl time, isolated from the HDRI pipeline.</item>
</CHANGE_SUMMARY>
*/

import { type CheerioAPI } from "@syrokomskyi/business-crawler/extract";
import { extractImpressumContacts } from "@syrokomskyi/business-crawler/extract";
import { ExtractGogolBase, type ObsRow } from "./ExtractGogolBase.js";
import type { PipelineContext } from "../pipeline/types.js";

export class ExtractImpressumContactsGogol extends ExtractGogolBase {
  override readonly id = "extract-impressum-contacts";
  override readonly table = "ext_impressum_contacts";

  override async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.brief.collectImpressumContacts) {
      console.log(
        `[${this.id}] skipped — brief.collectImpressumContacts is not enabled (opt-in PII collection)`,
      );
      return;
    }
    await super.run(ctx);
  }

  // Read the FETCHED Impressum page content (not the homepage): ext_impressum
  // links the homepage to the fetched Impressum page via detected_page_sha256.
  protected override get querySql(): string {
    return `SELECT ei.detected_page_sha256 AS content_sha256, pc.storage_path
            FROM ext_impressum ei
            JOIN page_contents pc ON pc.sha256 = ei.detected_page_sha256
            WHERE ei.detected_page_sha256 IS NOT NULL`;
  }

  protected override extractDom($: CheerioAPI, _row: ObsRow): unknown[] | null {
    const c = extractImpressumContacts($);
    const hasAny =
      c.companyName ||
      c.personNames.length > 0 ||
      c.street ||
      c.postalCode ||
      c.city ||
      c.phone ||
      c.email ||
      c.vatId;
    if (!hasAny) return null;
    return [
      c.companyName,
      c.personNames.length > 0 ? JSON.stringify(c.personNames) : null,
      c.street,
      c.postalCode,
      c.city,
      c.phone,
      c.email,
      c.vatId,
    ];
  }

  protected override get csvColumns(): string[] {
    return [
      "content_sha256",
      "company_name",
      "person_names",
      "street",
      "postal_code",
      "city",
      "phone",
      "email",
      "vat_id",
    ];
  }

  protected override get upsertSql(): string {
    return `INSERT INTO ext_impressum_contacts
      (content_sha256, extractor_ver, company_name, person_names, street, postal_code, city, phone, email, vat_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET
        extractor_ver=excluded.extractor_ver, company_name=excluded.company_name,
        person_names=excluded.person_names, street=excluded.street, postal_code=excluded.postal_code,
        city=excluded.city, phone=excluded.phone, email=excluded.email, vat_id=excluded.vat_id,
        extracted_at=unixepoch()`;
  }
}
