/*
<MODULE_CONTRACT>
<purpose>Shared audit-target loading and audit-run upsert helpers for audit pipeline apps.</purpose>
<non-goals>
  <item>Do not open or close database connections — callers manage DB lifecycle.</item>
  <item>Do not run audit tools or generate reports.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from duplicated loadTargetsFromRegistryDb and upsertEnvelope in 4-audit-lighthouse and 5-audit-axe.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";

/** A single site target for audit runs. */
export type AuditTarget = {
  siteId: number;
  provisionalAssetId: string;
  domain: string;
  url: string;
  bundesland: string | null;
};

/** Row shape for upserting into the audit_runs table. */
export type AuditRunRow = {
  tool: string;
  siteId: number;
  provisionalAssetId: string;
  url: string;
  durationMs: number;
  ok: boolean;
  errorClass: string | null;
  errorMessage: string | null;
  reportSha256: string | null;
  source: string;
};

/**
 * Load live audit targets from registry.db and liveness.db.
 * Both DBs must already be opened read-only by the caller and closed after.
 *
 * Queries all sites from registry, filters to only live sites from liveness,
 * builds https:// URLs, and applies a deterministic subset (first N).
 */
export function loadLiveAuditTargets(
  registryDb: Database.Database,
  livenessDb: Database.Database,
  sampleSize: number,
  logTag: string,
): AuditTarget[] {
  const rows = registryDb
    .prepare(
      `
    SELECT s.id AS siteId, br.da_id AS provisionalAssetId, s.domain, s.bundesland
    FROM sites s
    JOIN business_registry br ON br.domain = s.domain
    ORDER BY s.id
  `,
    )
    .all() as Array<Pick<AuditTarget, "siteId" | "provisionalAssetId" | "domain" | "bundesland">>;

  const liveRows = livenessDb
    .prepare(`SELECT provisional_asset_id FROM liveness_checks WHERE is_live = 1`)
    .all() as { provisional_asset_id: string }[];
  const liveAssetIds = new Set(liveRows.map((r) => r.provisional_asset_id));

  const allTargets: AuditTarget[] = rows
    .filter((r) => liveAssetIds.has(r.provisionalAssetId))
    .map((r) => ({
      siteId: r.siteId,
      provisionalAssetId: r.provisionalAssetId,
      domain: r.domain,
      url: `https://${r.domain}`,
      bundesland: r.bundesland,
    }));

  const limit = sampleSize > 0 ? sampleSize : allTargets.length;
  const result = allTargets.slice(0, limit);
  console.log(
    `[${logTag}] allTargets=${allTargets.length} limit=${limit} returning ${result.length} target(s)`,
  );
  return result;
}

/**
 * Upsert an audit run row into the audit_runs table.
 * The tool name is taken from the row — allows both 'lighthouse' and 'axe' to use the same function.
 */
export function upsertAuditRun(db: Database.Database, row: AuditRunRow): void {
  db.prepare(
    `
    INSERT INTO audit_runs (
      tool, site_id, provisional_asset_id, url, duration_ms,
      ok, error_class, error_message, report_sha256, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool, provisional_asset_id) DO UPDATE SET
      site_id       = excluded.site_id,
      url           = excluded.url,
      duration_ms   = excluded.duration_ms,
      ok            = excluded.ok,
      error_class   = excluded.error_class,
      error_message = excluded.error_message,
      report_sha256 = excluded.report_sha256,
      source        = excluded.source,
      fetched_at    = unixepoch()
  `,
  ).run(
    row.tool,
    row.siteId,
    row.provisionalAssetId,
    row.url,
    row.durationMs,
    row.ok ? 1 : 0,
    row.errorClass,
    row.errorMessage,
    row.reportSha256,
    row.source,
  );
}
