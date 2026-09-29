/*
<MODULE_CONTRACT>
<purpose>Project every current-run Factory asset state through its explicit provisional identity mapping.</purpose>
<non-goals><item>Does not mint identities, rewrite signed observations, or interpret historical canonical namespaces.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>A left join makes missing mappings fatal instead of silently shrinking the release population.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: require complete, unique UUIDv7 mappings for release identity exports.</item></CHANGE_SUMMARY>
*/
import type Database from "better-sqlite3";

export interface ReleaseIdentity {
  canonical_asset_id: string;
  domain: string;
  provisional_id: string;
  first_seen: string;
}

export function readReleaseIdentities(db: Database.Database, runId: string): ReleaseIdentity[] {
  if (!runId.trim()) throw new Error("RELEASE_IDENTITY_RUN_REQUIRED");
  const rows = db.prepare(`
    SELECT s.asset_id, s.domain, m.provisional_id, m.canonical_id, m.first_seen,
           m.domain AS mapped_domain
    FROM asset_states s LEFT JOIN asset_id_map m ON m.provisional_id = s.asset_id
    WHERE s.run_id = ? ORDER BY s.asset_id COLLATE BINARY
  `).all(runId) as Array<{
    asset_id: string; domain: string; provisional_id: string | null;
    canonical_id: string | null; first_seen: string | null; mapped_domain: string | null;
  }>;
  if (rows.length === 0) throw new Error("RELEASE_IDENTITIES_EMPTY");
  const provisional = new Set<string>();
  const canonical = new Set<string>();
  return rows.map(row => {
    if (row.provisional_id !== row.asset_id || row.canonical_id === null || row.first_seen === null)
      throw new Error("RELEASE_IDENTITY_MAPPING_MISSING");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.canonical_id))
      throw new Error("RELEASE_IDENTITY_UUID_INVALID");
    if (row.domain !== row.mapped_domain) throw new Error("RELEASE_IDENTITY_DOMAIN_MISMATCH");
    if (provisional.has(row.provisional_id) || canonical.has(row.canonical_id))
      throw new Error("RELEASE_IDENTITY_DUPLICATE");
    provisional.add(row.provisional_id);
    canonical.add(row.canonical_id);
    return { canonical_asset_id: row.canonical_id, domain: row.domain,
      provisional_id: row.provisional_id, first_seen: row.first_seen };
  });
}
