/*
<MODULE_CONTRACT>
<purpose>Provides a DuckDB-backed read interface for querying vault's Parquet shards efficiently. Encapsulates SQL construction so callers use typed methods instead of building raw SQL strings. Uses a pooled DuckDbSession to amortise connection startup across multiple queries.</purpose>
<non-goals>
  <item>Does not handle writing or modifying vault data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the VaultReader class with query methods.</item>
  <item>Architectural refactoring: uses DuckDbSession for pooled connections, added typed methods (getAllObservations, getObservationJsonMap, countRowsInShard) to absorb SQL construction, deprecated raw query()/glob methods.</item>
</CHANGE_SUMMARY>
*/

import type { AssetLifecycleEvent, Observation } from "@syrokomskyi/observatory-core";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import { DuckDbSession, queryParquet } from "./duckdb.js";
import { identityGlob, lifecycleGlob, obsGlob, statesGlob, shardKindGlob } from "./paths.js";
import type { VaultAssetIdentityRecord, VaultAssetStateRecord } from "./writer.js";

/** Escapes a single-quoted string literal for DuckDB SQL. */
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, "/");
}

/** Normalises a Windows backslash path to forward slashes for DuckDB. */
function fwdSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * DuckDB-backed read interface over the vault's Parquet shards.
 *
 * Uses a pooled DuckDbSession internally so multiple queries in a pipeline step
 * amortise the DuckDB startup cost. Callers use typed methods instead of
 * constructing raw SQL strings.
 */
export class VaultReader {
  private readonly session: DuckDbSession;

  constructor(private readonly vaultDir: string) {
    this.session = new DuckDbSession();
  }

  /** Closes the pooled DuckDB session. Call when done to release native resources. */
  close(): void {
    this.session.close();
  }

  // ── Typed read methods (preferred) ─────────────────────────────────────────

  /**
   * Returns ALL observation rows for a year (or all years) as raw objects.
   * Replaces the common pattern of `reader.query(SELECT * FROM read_parquet(reader.obsGlob(year), ...))`.
   */
  async getAllObservations(year?: number): Promise<Array<Record<string, unknown>>> {
    const glob = shardKindGlob(this.vaultDir, "observations", year);
    try {
      return await this.session.query<Record<string, unknown>>(
        `SELECT * FROM read_parquet('${glob}', hive_partitioning=true)`,
      );
    } catch {
      return [];
    }
  }

  /**
   * Returns a map of `observation_id → value_json` (aliased as `obs_json`) for a given
   * factory run, used by the tiering rehydrate path. Absorbs the SQL construction that
   * was previously inlined in tier-core.ts.
   */
  async getObservationJsonMap(year: number, factoryRunId: string): Promise<Map<string, string>> {
    const glob = shardKindGlob(this.vaultDir, "observations", year);
    try {
      const rows = await this.session.query<{ observation_id: string; obs_json: string }>(
        `SELECT observation_id, value_json AS obs_json
         FROM read_parquet('${glob}', hive_partitioning=true)
         WHERE crawl_id = '${sqlEscape(factoryRunId)}'`,
      );
      return new Map(rows.map((r) => [r.observation_id, r.obs_json]));
    } catch {
      return new Map();
    }
  }

  /**
   * Counts rows in a specific Parquet shard by absolute path. Used by the manifest
   * backfill tool. Absorbs the SQL construction and string escaping that was
   * previously inlined in backfill-vault-manifest.ts.
   */
  async countRowsInShard(absShardPath: string): Promise<number> {
    const fwd = fwdSlash(absShardPath).replace(/'/g, "''");
    const rows = await this.session.query<{ n: number | bigint }>(
      `SELECT COUNT(*) AS n FROM read_parquet('${fwd}')`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Returns the identity registry as a `provisional_id → canonical_id` map, read across
   * ALL years so a domain first seen in an earlier year resolves to the SAME canonical id
   * now (WP12 cross-year stable identity). Empty when the registry has no shards yet.
   */
  async getIdentityMap(): Promise<Map<string, string>> {
    const records = await this.getAssetIdentityRecords();
    return new Map(records.map((r) => [r.provisional_id, r.canonical_id]));
  }

  /** Returns every identity record in the registry (all years). */
  async getAssetIdentityRecords(): Promise<VaultAssetIdentityRecord[]> {
    try {
      const glob = shardKindGlob(this.vaultDir, "asset_identity");
      return await this.session.query<VaultAssetIdentityRecord>(
        `SELECT provisional_id, canonical_id, domain, first_seen_period, minted_at
         FROM read_parquet('${glob}', hive_partitioning=true)`,
      );
    } catch {
      return [];
    }
  }

  /**
   * Returns all business lifecycle events in the vault (all years), oldest first — the
   * durable "story" behind every asset. Empty when the stream has no shards yet.
   *
   * DuckDB auto-types ISO-8601 timestamp columns (event_at/recorded_at) as TIMESTAMP, so
   * they read back as Date; they are coerced to canonical UTC ISO strings here so callers
   * (and reconstructAssetHistory's string ordering) get a clean AssetLifecycleEvent.
   */
  async getLifecycleEvents(): Promise<AssetLifecycleEvent[]> {
    try {
      const glob = shardKindGlob(this.vaultDir, "asset_lifecycle");
      const rows = await this.session.query<Record<string, unknown>>(
        `SELECT event_id, asset_id, event_type, event_at, period, related_asset_id,
                domain, reason, source, recorded_at, evidence_ref
         FROM read_parquet('${glob}', hive_partitioning=true)
         ORDER BY event_at, recorded_at`,
      );
      return rows.map(normalizeLifecycleRow);
    } catch {
      return [];
    }
  }

  /**
   * Returns all signed observations for a given asset, ordered by observed_at.
   */
  async getObservationsForAsset(assetId: string, year?: number): Promise<SignedObservation[]> {
    const glob = shardKindGlob(this.vaultDir, "observations", year);
    return this.session.query<SignedObservation>(
      `SELECT *
       FROM read_parquet('${glob}', hive_partitioning=true)
       WHERE asset_id = '${sqlEscape(assetId)}'
       ORDER BY observed_at`,
    );
  }

  /**
   * Returns all asset-state records stored in the vault for a year. These are the
   * self-contained {@link AssetStateRecord} snapshots (asset metadata + HWO mappings)
   * written by {@link VaultWriter.writeShard} — the input needed to rebuild a
   * quarter's asset_states from the vault alone (WP7), without the factory emit-bundle.
   */
  async getAssetStateRecords(year?: number): Promise<VaultAssetStateRecord[]> {
    const glob = shardKindGlob(this.vaultDir, "asset_states", year);
    return this.session.query<VaultAssetStateRecord>(
      `SELECT * FROM read_parquet('${glob}', hive_partitioning=true)`,
    );
  }

  /**
   * Counts observations per signal_path across the specified year.
   * Useful for pipeline health checks.
   */
  async countObservationsBySignal(
    year?: number,
  ): Promise<Array<{ signal_path: string; count: number }>> {
    const glob = shardKindGlob(this.vaultDir, "observations", year);
    return this.session.query<{ signal_path: string; count: number }>(
      `SELECT signal_path, COUNT(*) AS count
       FROM read_parquet('${glob}', hive_partitioning=true)
       GROUP BY signal_path
       ORDER BY count DESC`,
    );
  }

  /**
   * Returns all observations for a given run, in insertion order.
   * Used by the verify-vault harness (P0.2.10).
   */
  async getObservationsForRun(runId: string, year?: number): Promise<Observation[]> {
    const glob = shardKindGlob(this.vaultDir, "observations", year);
    return this.session.query<Observation>(
      `SELECT *
       FROM read_parquet('${glob}', hive_partitioning=true)
       WHERE crawl_id = '${sqlEscape(runId)}'
       ORDER BY observation_id`,
    );
  }

  // ── Backward-compat methods (deprecated: use typed methods instead) ─────────

  /** @deprecated Use typed methods (getAllObservations, getObservationJsonMap, etc.) instead. */
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    return queryParquet<T>(sql);
  }

  /** @deprecated Glob construction is now internal. */
  obsGlob(year?: number): string {
    return obsGlob(this.vaultDir, year);
  }

  /** @deprecated Glob construction is now internal. */
  statesGlob(year?: number): string {
    return statesGlob(this.vaultDir, year);
  }

  /** @deprecated Glob construction is now internal. */
  identityGlob(year?: number): string {
    return identityGlob(this.vaultDir, year);
  }

  /** @deprecated Glob construction is now internal. */
  lifecycleGlob(year?: number): string {
    return lifecycleGlob(this.vaultDir, year);
  }
}

/** DuckDB read-back gives Date for TIMESTAMP columns; coerce to canonical UTC ISO strings. */
const toIsoStr = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const toStrOrNull = (v: unknown): string | null => (v == null ? null : String(v));

/** Coerces a DuckDB-read lifecycle row back into a clean AssetLifecycleEvent. */
function normalizeLifecycleRow(row: Record<string, unknown>): AssetLifecycleEvent {
  return {
    event_id: String(row.event_id),
    asset_id: String(row.asset_id),
    event_type: String(row.event_type) as AssetLifecycleEvent["event_type"],
    event_at: toIsoStr(row.event_at),
    period: toStrOrNull(row.period),
    related_asset_id: toStrOrNull(row.related_asset_id),
    domain: toStrOrNull(row.domain),
    reason: toStrOrNull(row.reason),
    source: String(row.source) as AssetLifecycleEvent["source"],
    recorded_at: toIsoStr(row.recorded_at),
    evidence_ref: toStrOrNull(row.evidence_ref),
  };
}
