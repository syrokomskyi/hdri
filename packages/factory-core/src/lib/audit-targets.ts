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
  domain: string;
  url: string;
  bundesland: string | null;
};

/** Row shape for upserting into the audit_runs table. */
export type AuditRunRow = {
  tool: string;
  siteId: number;
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
    SELECT s.id AS siteId, s.domain, s.bundesland
    FROM sites s
    ORDER BY s.id
  `,
    )
    .all() as Array<Pick<AuditTarget, "siteId" | "domain" | "bundesland">>;

  const liveRows = livenessDb
    .prepare(`SELECT site_id FROM liveness_checks WHERE is_live = 1`)
    .all() as { site_id: number }[];
  const liveSiteIds = new Set(liveRows.map((r) => r.site_id));

  const allTargets: AuditTarget[] = rows
    .filter((r) => liveSiteIds.has(r.siteId))
    .map((r) => ({
      siteId: r.siteId,
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
      tool, site_id, url, duration_ms,
      ok, error_class, error_message, report_sha256, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool, site_id) DO UPDATE SET
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
    row.url,
    row.durationMs,
    row.ok ? 1 : 0,
    row.errorClass,
    row.errorMessage,
    row.reportSha256,
    row.source,
  );
}
