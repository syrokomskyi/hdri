import path from 'node:path';

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
 *
 * Using Hive-compatible `year=YYYY/` directory names enables DuckDB
 * hive_partitioning=true and partition pruning in queries.
 */

export const VAULT_OBSERVATIONS_DIR = 'observations';
export const VAULT_ASSET_STATES_DIR = 'asset_states';

export function obsShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_OBSERVATIONS_DIR, `year=${year}`);
}

export function obsShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(obsShardDir(vaultDir, year), `${runId}.parquet`);
}

export function statesShardDir(vaultDir: string, year: number): string {
  return path.join(vaultDir, VAULT_ASSET_STATES_DIR, `year=${year}`);
}

export function statesShardPath(vaultDir: string, year: number, runId: string): string {
  return path.join(statesShardDir(vaultDir, year), `${runId}.parquet`);
}

/**
 * Glob pattern for DuckDB read_parquet(). Forward slashes required on all
 * platforms since this goes into SQL strings.
 */
export function obsGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, '/');
  const yearPart = year != null ? `year=${year}` : '*';
  return `${base}/${VAULT_OBSERVATIONS_DIR}/${yearPart}/*.parquet`;
}

export function statesGlob(vaultDir: string, year?: number): string {
  const base = vaultDir.replace(/\\/g, '/');
  const yearPart = year != null ? `year=${year}` : '*';
  return `${base}/${VAULT_ASSET_STATES_DIR}/${yearPart}/*.parquet`;
}
