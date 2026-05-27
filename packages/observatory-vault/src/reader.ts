import type { AssetState, Observation } from '@org/observatory-core';
import type { SignedObservation } from '@org/observatory-crypto';
import { queryParquet } from './duckdb.js';
import { obsGlob, statesGlob } from './paths.js';

/**
 * DuckDB-backed read interface over the vault's Parquet shards.
 *
 * Each method spins up an ephemeral in-memory DuckDB, runs the query, then
 * shuts down. This is fine for our batch workload (queries run once per pipeline
 * step, not in a tight loop). A persistent connection would be premature.
 */
export class VaultReader {
  constructor(private readonly vaultDir: string) {}

  /**
   * Executes arbitrary DuckDB SQL. Use the glob helpers in your SQL to
   * reference vault data:
   *
   *   const sql = `
   *     SELECT signal_path, COUNT(*) AS n
   *     FROM read_parquet('${reader.obsGlob(2026)}', hive_partitioning=true)
   *     WHERE asset_id = '...'
   *     GROUP BY signal_path
   *   `;
   *   const rows = await reader.query(sql);
   */
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    return queryParquet<T>(sql);
  }

  /** Glob pattern for the observations partition, usable in DuckDB SQL. */
  obsGlob(year?: number): string {
    return obsGlob(this.vaultDir, year);
  }

  /** Glob pattern for the asset_states partition, usable in DuckDB SQL. */
  statesGlob(year?: number): string {
    return statesGlob(this.vaultDir, year);
  }

  /**
   * Returns all signed observations for a given asset, ordered by observed_at.
   * Convenience wrapper around query().
   */
  async getObservationsForAsset(
    assetId: string,
    year?: number,
  ): Promise<SignedObservation[]> {
    const glob = this.obsGlob(year);
    const sql = `
      SELECT *
      FROM read_parquet('${glob}', hive_partitioning=true)
      WHERE asset_id = '${assetId.replace(/'/g, "''")}'
      ORDER BY observed_at
    `;
    return this.query<SignedObservation>(sql);
  }

  /**
   * Returns the current (valid_to IS NULL) asset state for a given asset.
   */
  async getCurrentAssetState(
    assetId: string,
    year?: number,
  ): Promise<AssetState | null> {
    const glob = this.statesGlob(year);
    const sql = `
      SELECT *
      FROM read_parquet('${glob}', hive_partitioning=true)
      WHERE asset_id = '${assetId.replace(/'/g, "''")}' AND valid_to IS NULL
      LIMIT 1
    `;
    const rows = await this.query<AssetState>(sql);
    return rows[0] ?? null;
  }

  /**
   * Counts observations per signal_path across the specified year.
   * Useful for pipeline health checks.
   */
  async countObservationsBySignal(
    year?: number,
  ): Promise<Array<{ signal_path: string; count: number }>> {
    const glob = this.obsGlob(year);
    const sql = `
      SELECT signal_path, COUNT(*) AS count
      FROM read_parquet('${glob}', hive_partitioning=true)
      GROUP BY signal_path
      ORDER BY count DESC
    `;
    return this.query<{ signal_path: string; count: number }>(sql);
  }

  /**
   * Returns all observations for a given run, in insertion order.
   * Used by the verify-vault harness (P0.2.10).
   */
  async getObservationsForRun(
    runId: string,
    year?: number,
  ): Promise<Observation[]> {
    const glob = this.obsGlob(year);
    const sql = `
      SELECT *
      FROM read_parquet('${glob}', hive_partitioning=true)
      WHERE crawl_id = '${runId.replace(/'/g, "''")}'
      ORDER BY observation_id
    `;
    return this.query<Observation>(sql);
  }
}
