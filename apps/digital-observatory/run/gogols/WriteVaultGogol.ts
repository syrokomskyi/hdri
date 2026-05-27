/*
<MODULE_CONTRACT>
<purpose>Exports signed observations from the observatory DB to vault Parquet shards,
one shard per factory run_id. The vault is the long-term accumulating store read
by downstream analytics and public transparency tooling.</purpose>
<keywords>vault, parquet, duckdb, export, signed observations</keywords>
<responsibilities>
  <item>Resolves vault directory from brief.vaultDir or falls back to .output/vault/.</item>
  <item>Reads factory run_ids from synced_bundles for this observatory run.</item>
  <item>Skips shards that already exist on disk (idempotent re-runs).</item>
  <item>Reconstructs SignedObservation from obs_json + signing columns for each factory run.</item>
  <item>Writes one ZSTD Parquet shard per factory run via VaultWriter.</item>
  <item>Writes vault-write-report.json artifact with shard paths and counts.</item>
</responsibilities>
<non-goals>
  <item>Does not sign observations — that is done by SignObservationsGogol.</item>
  <item>Does not merge or compact existing shards.</item>
  <item>Does not apply k-anonymity — that is done by ExportMartGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="WriteVaultGogol">Gogol that writes signed observations to vault Parquet shards.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation (P0.3): observatory DB → vault Parquet export.</item>
  <item>P0.4: use factory_run_id instead of run_id for observation lookup.</item>
  <item>Replace raw console.log with structured NDJSON logger from @org/pipeline-core.</item>
</CHANGE_SUMMARY>
*/

import fsp from 'node:fs/promises';
import path from 'node:path';
import { VaultWriter, obsShardPath } from '@org/observatory-vault';
import type { SignedObservation } from '@org/observatory-crypto';
import type { Observation } from '@org/observatory-core';
import { parsePeriod } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';
import { outputRootDir } from '../config';

type SyncedRow = {
  run_id: string;
  app_id: string;
  obs_count: number;
};

type SignedObsRow = {
  obs_json: string;
  signature: string;
  signed_at: string;
  signing_key_id: string;
  collector_id: string;
};

type ShardResult = {
  factoryRunId: string;
  appId: string;
  shardPath: string;
  count: number;
  skipped: boolean;
};

export class WriteVaultGogol extends Gogol {
  override readonly id = 'write-vault';

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error('Missing run_id — setup-observatory-run must run first');
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { runId, brief } = ctx.state;
    const year = parsePeriod(brief.period).year;
    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, 'vault');

    log.info('vault-dir', `vault=${vaultDir}`, { vaultDir });

    const db = openObservatoryDb(year);
    const writer = new VaultWriter(vaultDir);
    const results: ShardResult[] = [];

    try {
      // Find factory runs synced during this observatory run
      const syncedRuns = db.prepare(`
        SELECT run_id, app_id, obs_count
        FROM synced_bundles
        WHERE observatory_run_id = ?
        ORDER BY run_id
      `).all(runId) as SyncedRow[];

      if (syncedRuns.length === 0) {
        log.info('no-factory-runs', 'No factory runs synced in this observatory run — nothing to export');
      }

      for (const { run_id: factoryRunId, app_id: appId, obs_count } of syncedRuns) {
        // Idempotency: skip if shard already exists
        const shardPath = obsShardPath(vaultDir, year, factoryRunId);

        try {
          await fsp.access(shardPath);
          log.info('shard-exists', `Shard exists — skipping factory run_id=${factoryRunId}`, { factoryRunId });
          results.push({ factoryRunId, appId, shardPath, count: obs_count, skipped: true });
          continue;
        } catch {
          // File does not exist — proceed with write
        }

        // Load signed observations for this factory run
        const rows = db.prepare(`
          SELECT obs_json, signature, signed_at, signing_key_id, collector_id
          FROM observations
          WHERE factory_run_id = ? AND signature IS NOT NULL AND obs_json IS NOT NULL
        `).all(factoryRunId) as SignedObsRow[];

        if (rows.length === 0) {
          log.info('no-signed-obs', `No signed observations for factory run_id=${factoryRunId} — skipping shard`, { factoryRunId });
          results.push({ factoryRunId, appId, shardPath: '', count: 0, skipped: true });
          continue;
        }

        const signed: SignedObservation[] = rows.map((row) => {
          const obs = JSON.parse(row.obs_json) as Observation;
          return {
            ...obs,
            signature: row.signature,
            signed_at: row.signed_at,
            signing_key_id: row.signing_key_id,
            collector_id: row.collector_id,
          };
        });

        log.info('writing-shard', `Writing ${signed.length} obs → ${path.basename(shardPath)}`, { shardPath: path.basename(shardPath), count: signed.length });
        const result = await writer.writeObservationShard(signed, { year, runId: factoryRunId });
        results.push({ factoryRunId, appId, shardPath: result.shardPath, count: result.count, skipped: false });
      }
    } finally {
      db.close();
    }

    const totalWritten = results.filter((r) => !r.skipped).reduce((s, r) => s + r.count, 0);
    const shardsWritten = results.filter((r) => !r.skipped).length;

    log.info('write-finished', `Done. ${shardsWritten} shard(s) written, ${totalWritten} observations.`, { shardsWritten, totalWritten });

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'vault-write-report.json'),
      JSON.stringify({
        observatory_run_id: runId,
        vault_dir: vaultDir,
        year,
        shards: results,
        total_written: totalWritten,
        shards_written: shardsWritten,
        shards_skipped: results.filter((r) => r.skipped).length,
      }, null, 2),
    );
  }
}
