import fsp from 'node:fs/promises';
import type { AssetState } from '@org/observatory-core';
import type { SignedObservation } from '@org/observatory-crypto';
import { writeParquet } from './duckdb.js';
import {
  obsShardDir,
  obsShardPath,
  statesShardDir,
  statesShardPath,
} from './paths.js';

export type WriteResult = {
  readonly shardPath: string;
  readonly count: number;
};

/**
 * Appends signed observations to the vault as a new Parquet shard.
 * Each call produces exactly one shard file named by run_id.
 * Readers query all shards via glob pattern — no shard merging needed.
 */
export class VaultWriter {
  constructor(private readonly vaultDir: string) {}

  async writeObservationShard(
    observations: readonly SignedObservation[],
    meta: { year: number; runId: string },
  ): Promise<WriteResult> {
    if (observations.length === 0) {
      return { shardPath: '', count: 0 };
    }

    const shardPath = obsShardPath(this.vaultDir, meta.year, meta.runId);
    await fsp.mkdir(obsShardDir(this.vaultDir, meta.year), { recursive: true });
    await writeParquet(observations as object[], shardPath);
    return { shardPath, count: observations.length };
  }

  async writeAssetStateShard(
    states: readonly AssetState[],
    meta: { year: number; runId: string },
  ): Promise<WriteResult> {
    if (states.length === 0) {
      return { shardPath: '', count: 0 };
    }

    const shardPath = statesShardPath(this.vaultDir, meta.year, meta.runId);
    await fsp.mkdir(statesShardDir(this.vaultDir, meta.year), { recursive: true });
    await writeParquet(states as object[], shardPath);
    return { shardPath, count: states.length };
  }
}
