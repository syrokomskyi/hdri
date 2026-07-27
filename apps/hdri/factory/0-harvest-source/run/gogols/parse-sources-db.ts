/*
<MODULE_CONTRACT>
<purpose>SQLite write helpers for the parse-sources gogol — this module handles parse-sources-db operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not read source files, render reports, or orchestrate batches.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted database write helpers from ParseSourcesGogol.ts during file-size refactor.</item>
</CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";

import type { SourceBusinessSeed } from "../source-records.js";
import type { SkipReason, SkipSummary, SourceFileStat } from "./parse-sources-types.js";

export const upsertSite = (db: Database.Database, domain: string): number => {
  db.prepare(
    `
    INSERT INTO sites (domain)
    VALUES (?)
    ON CONFLICT(domain) DO NOTHING
  `,
  ).run(domain);

  const row = db.prepare("SELECT id FROM sites WHERE domain = ?").get(domain) as { id: number };
  return row.id;
};

export const upsertSourceSeed = (
  db: Database.Database,
  siteId: number,
  sourcePath: string,
  item: SourceBusinessSeed,
): void => {
  db.prepare(
    `
    INSERT INTO site_source_seeds (
      site_id, source_path, source_item_key,
      business_name, street_address, postal_code, city, phone, email,
      website_url, category, source_profile_url, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, source_path, source_item_key) DO NOTHING
  `,
  ).run(
    siteId,
    sourcePath,
    item.sourceItemKey,
    item.businessName,
    item.streetAddress,
    item.postalCode,
    item.city,
    item.phone,
    item.email,
    item.websiteUrl,
    item.category,
    item.sourceProfileUrl,
    JSON.stringify(item.raw),
  );
};

export const insertSkippedSeed = (
  db: Database.Database,
  sourcePath: string,
  item: SourceBusinessSeed,
  reason: SkipReason,
): void => {
  db.prepare(
    `
    INSERT INTO skipped_source_seeds (
      source_path, item_key, business_name, raw_url, reason
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_path, item_key) DO NOTHING
  `,
  ).run(sourcePath, item.sourceItemKey, item.businessName, item.websiteUrl, reason);
};

export const upsertFileStat = (
  db: Database.Database,
  stat: SourceFileStat,
  noUrlWarnings: number,
  ss: SkipSummary,
): void => {
  db.prepare(
    `
    INSERT INTO source_file_stats (
      source_path, items_parsed, items_registered, items_skipped,
      no_url_warnings, no_url, bad_url, stop_domain
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      items_parsed = excluded.items_parsed,
      items_registered = excluded.items_registered,
      items_skipped = excluded.items_skipped,
      no_url_warnings = excluded.no_url_warnings,
      no_url = excluded.no_url,
      bad_url = excluded.bad_url,
      stop_domain = excluded.stop_domain
  `,
  ).run(
    stat.path,
    stat.itemsParsed,
    stat.itemsRegistered,
    stat.itemsSkipped,
    noUrlWarnings,
    ss.noUrl,
    ss.badUrl,
    ss.stopDomain,
  );
};
