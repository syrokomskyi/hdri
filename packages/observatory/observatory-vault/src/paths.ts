/*
<MODULE_CONTRACT>
<purpose>Manages directory and file path generation for vault data storage, enabling efficient data partitioning and retrieval. Centralises VaultShardKind and SHARD_KIND_DIRS so writer and reader resolve shard paths through a single mapping.</purpose>
<non-goals>
  <item>Does not handle actual data storage or retrieval operations.</item>
  <item>Does not perform data validation or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of path and glob pattern utilities for vault directories.</item>
  <item>Architectural refactoring: moved VaultShardKind here, added SHARD_KIND_DIRS and resolveShardPaths for unified shard path resolution.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

/**
 * Vault directory layout:
 *
 *   <vaultDir>/
 *     observations/
 *       year=2026/
 *         {run_id}.parquet     ← one shard per factory run
 *     asset_states/
 *       year=2026/
 *         {run_id}.parquet
 *     asset_identity/
 *       year=2026/
 *         {run_id}.parquet     ← newly-minted (provisional → canonical) IDs, per mint run
 *
 * Using Hive-compatible `year=YYYY/` directory names enables DuckDB
 * hive_partitioning=true and partition pruning in queries.
 *
 * `asset_identity` is the cross-year, append-only identity registry: it is always
 * read across ALL years (glob `year=*`) so a domain minted in an earlier year keeps
 * the SAME canonical id in every later year. It is partitioned by year only for
 * shard housekeeping, never for lookup pruning.
 */

/** Which append-only stream a shard belongs to. Open-ended so new streams can be recorded without a schema change. */
export type VaultShardKind =
  | "observations"
  | "asset_states"
  | "asset_identity"
  | "asset_lifecycle"
  | (string & {});

export const VAULT_OBSERVATIONS_DIR = "observations";
export const VAULT_ASSET_STATES_DIR = "asset_states";
export const VAULT_ASSET_IDENTITY_DIR = "asset_identity";
export const VAULT_LIFECYCLE_DIR = "asset_lifecycle";

/** Maps a VaultShardKind to its directory name under the vault root. Unknown kinds fall back to the kind string itself. */
export const SHARD_KIND_DIRS = {
  observations: VAULT_OBSERVATIONS_DIR,
  asset_states: VAULT_ASSET_STATES_DIR,
  asset_identity: VAULT_ASSET_IDENTITY_DIR,
  asset_lifecycle: VAULT_LIFECYCLE_DIR,
} as const satisfies Record<string, string>;

/** Resolves the directory name for a shard kind (known or unknown). */
export function shardKindDir(kind: VaultShardKind): string {
  return SHARD_KIND_DIRS[kind as keyof typeof SHARD_KIND_DIRS] ?? kind;
}

/**
 * Unified shard path resolver: given (vaultDir, kind, year, runId), returns the shard directory,
 * the shard file path, and a year-specific DuckDB glob for reading. Replaces the per-kind
 * path/glob functions for new code; those functions remain as thin wrappers for backward compat.
 */
export function resolveShardPaths(
  vaultDir: string,
  kind: VaultShardKind,
  year: number,
  runId: string,
): { shardDir: string; shardPath: string; glob: string } {
  const dirName = shardKindDir(kind);
  const shardDir = path.join(vaultDir, dirName, `year=${year}`);
  const shardPath = path.join(shardDir, `${runId}.parquet`);
  const base = vaultDir.replace(/\\/g, "/");
  const glob = `${base}/${dirName}/year=${year}/*.parquet`;
  return { shardDir, shardPath, glob };
}

/** Glob pattern for a shard kind across all years or a specific year. */
export function shardKindGlob(vaultDir: string, kind: VaultShardKind, year?: number): string {
  const base = vaultDir.replace(/\\/g, "/");
  const dirName = shardKindDir(kind);
  const yearPart = year != null ? `year=${year}` : "*";
  return `${base}/${dirName}/${yearPart}/*.parquet`;
}

/** @deprecated Use resolveShardPaths(vaultDir, "observations", year, runId) instead. */
export function obsShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_OBSERVATIONS_DIR, `year=${year}`);
}

/** @deprecated Use resolveShardPaths(vaultDir, "observations", year, runId) instead. */
export function obsShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(obsShardDir(vaultDir, year), `${runId}.parquet`);
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_states", year, runId) instead. */
export function statesShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_ASSET_STATES_DIR, `year=${year}`);
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_states", year, runId) instead. */
export function statesShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(statesShardDir(vaultDir, year), `${runId}.parquet`);
}

/**
 * Glob pattern for DuckDB read_parquet(). Forward slashes required on all
 * platforms since this goes into SQL strings.
 */
/** @deprecated Use shardKindGlob(vaultDir, "observations", year) instead. */
export function obsGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, "/");
  const yearPart = year != null ? `year=${year}` : "*";
  return `${base}/${VAULT_OBSERVATIONS_DIR}/${yearPart}/*.parquet`;
}

/** @deprecated Use shardKindGlob(vaultDir, "asset_states", year) instead. */
export function statesGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, "/");
  const yearPart = year != null ? `year=${year}` : "*";
  return `${base}/${VAULT_ASSET_STATES_DIR}/${yearPart}/*.parquet`;
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_identity", year, runId) instead. */
export function identityShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_ASSET_IDENTITY_DIR, `year=${year}`);
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_identity", year, runId) instead. */
export function identityShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(identityShardDir(vaultDir, year), `${runId}.parquet`);
}

/**
 * Glob for the identity registry. Defaults to ALL years (`year=*`) because canonical
 * identity is cross-year by design — pass a year only for shard housekeeping.
 */
/** @deprecated Use shardKindGlob(vaultDir, "asset_identity", year) instead. */
export function identityGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, "/");
  const yearPart = year != null ? `year=${year}` : "*";
  return `${base}/${VAULT_ASSET_IDENTITY_DIR}/${yearPart}/*.parquet`;
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_lifecycle", year, runId) instead. */
export function lifecycleShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_LIFECYCLE_DIR, `year=${year}`);
}

/** @deprecated Use resolveShardPaths(vaultDir, "asset_lifecycle", year, runId) instead. */
export function lifecycleShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(lifecycleShardDir(vaultDir, year), `${runId}.parquet`);
}

/**
 * Glob for the lifecycle-event stream. Defaults to ALL years (`year=*`) since a
 * business's history spans years and is always read whole.
 */
/** @deprecated Use shardKindGlob(vaultDir, "asset_lifecycle", year) instead. */
export function lifecycleGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, "/");
  const yearPart = year != null ? `year=${year}` : "*";
  return `${base}/${VAULT_LIFECYCLE_DIR}/${yearPart}/*.parquet`;
}
