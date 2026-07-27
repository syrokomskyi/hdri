/*
<MODULE_CONTRACT>
<purpose>Pure parsing of a vault shard's relative path into its (kind, year, runId) coordinates
(WP16 finding-2). The vault lays shards out as `<kind>/year=<YYYY>/<runId>.parquet`; the manifest
backfill needs to recover those coordinates for a shard that predates the WP10 manifest (e.g. the
Q2 observations shard). Extracted so the parsing is unit-tested without touching disk.</purpose>
<non-goals>
  <item>No I/O, no hashing — the caller lists shards, hashes them, and writes the manifest.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 finding-2: shard-path parsing for the vault-manifest backfill.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

export type ParsedShard = {
  /** Vault stream: observations | asset_states | asset_identity | asset_lifecycle | … */
  readonly kind: string;
  readonly year: number;
  /** run_id the shard is named by (factory run for observations, observatory run otherwise). */
  readonly runId: string;
};

/**
 * Parses a forward-slashed, vault-root-relative shard path of the form
 * `"<kind>/year=<YYYY>/<runId>.parquet"`. Returns null for anything that does not match the
 * hive-partitioned layout (so an unexpected file is skipped, not mis-recorded).
 */
export function parseShardPath(relPath: string): ParsedShard | null {
  const parts = relPath.split("/");
  if (parts.length !== 3) return null;
  const [kind, yearDir, file] = parts;
  if (!kind || !yearDir || !file) return null;
  const ym = /^year=(\d{4})$/.exec(yearDir);
  if (!ym || !file.endsWith(".parquet")) return null;
  const runId = file.slice(0, -".parquet".length);
  if (!runId) return null;
  return { kind, year: Number(ym[1]), runId };
}
