/*
<MODULE_CONTRACT>
<purpose>Exports signed observations from the observatory DB to vault Parquet shards,
one shard per factory run_id. The vault is the long-term accumulating store read
by downstream analytics and public transparency tooling.</purpose>
<non-goals>
  <item>Does not sign observations — that is done by SignObservationsGogol.</item>
  <item>Does not merge or compact existing shards.</item>
  <item>Does not apply k-anonymity — that is done by ExportMartGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation (P0.3): observatory DB → vault Parquet export.</item>
  <item>P0.4: use factory_run_id instead of run_id for observation lookup.</item>
  <item>Replace raw console.log with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import fsp from "node:fs/promises";
import path from "node:path";
import { VaultWriter, obsShardPath, statesShardPath } from "@syrokomskyi/observatory-vault";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { outputRootDir } from "../config";
import { assetStateRecordsForVault } from "../rebuild/rebuild-core";

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
  override readonly id = "write-vault";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id — setup-observatory-run must run first");
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    // validateBeforeStart guarantees runId is set.
    const runId = ctx.state.runId!;
    const { brief } = ctx.state;
    const year = parsePeriod(brief.period).year;
    const log = createJsonLogger({
      app: "observatory",
      pipeline: "observatory",
    }).withContext({ gogol: this.id });

    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");

    log.info("vault-dir", `vault=${vaultDir}`, { vaultDir });

    const db = openObservatoryDb(year);
    const writer = new VaultWriter(vaultDir);
    const results: ShardResult[] = [];
    let assetStatesShard: { shardPath: string; count: number; skipped: boolean } | null;

    try {
      // Find factory runs synced during this observatory run
      const syncedRuns = db
        .prepare(
          `
        SELECT run_id, app_id, obs_count
        FROM synced_bundles
        WHERE observatory_run_id = ?
        ORDER BY run_id
      `,
        )
        .all(runId) as SyncedRow[];

      if (syncedRuns.length === 0) {
        log.info(
          "no-factory-runs",
          "No factory runs synced in this observatory run — nothing to export",
        );
      }

      for (const { run_id: factoryRunId, app_id: appId, obs_count } of syncedRuns) {
        // Idempotency: skip if shard already exists
        const shardPath = obsShardPath(vaultDir, year, factoryRunId);

        try {
          await fsp.access(shardPath);
          log.info("shard-exists", `Shard exists — skipping factory run_id=${factoryRunId}`, {
            factoryRunId,
          });
          results.push({ factoryRunId, appId, shardPath, count: obs_count, skipped: true });
          continue;
        } catch {
          // File does not exist — proceed with write
        }

        // Load signed observations for this factory run
        const rows = db
          .prepare(
            `
          SELECT obs_json, signature, signed_at, signing_key_id, collector_id
          FROM observations
          WHERE factory_run_id = ? AND signature IS NOT NULL AND obs_json IS NOT NULL
        `,
          )
          .all(factoryRunId) as SignedObsRow[];

        if (rows.length === 0) {
          log.info(
            "no-signed-obs",
            `No signed observations for factory run_id=${factoryRunId} — skipping shard`,
            { factoryRunId },
          );
          results.push({ factoryRunId, appId, shardPath: "", count: 0, skipped: true });
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

        log.info("writing-shard", `Writing ${signed.length} obs → ${path.basename(shardPath)}`, {
          shardPath: path.basename(shardPath),
          count: signed.length,
        });
        const result = await writer.writeShard("observations", signed as readonly object[], {
          year,
          runId: factoryRunId,
        });
        results.push({
          factoryRunId,
          appId,
          shardPath: result.shardPath,
          count: result.count,
          skipped: false,
        });
      }

      // Additively persist this run's asset_states to the vault (one shard keyed by the
      // observatory run_id). Storing the self-contained AssetStateRecord + period makes a
      // future quarter rebuildable from the vault alone, without the factory emit-bundle.
      const statesShard = statesShardPath(vaultDir, year, runId);
      try {
        await fsp.access(statesShard);
        log.info("asset-states-shard-exists", `Asset-states shard exists — skipping`, {
          shardPath: path.basename(statesShard),
        });
        const existingCount = (
          db.prepare(`SELECT COUNT(*) AS c FROM asset_states WHERE run_id = ?`).get(runId) as {
            c: number;
          }
        ).c;
        assetStatesShard = { shardPath: statesShard, count: existingCount, skipped: true };
      } catch {
        const stateRecords = assetStateRecordsForVault(db, runId);
        if (stateRecords.length === 0) {
          log.info("no-asset-states", "No asset_states for this run — skipping asset-states shard");
          assetStatesShard = { shardPath: "", count: 0, skipped: true };
        } else {
          log.info(
            "writing-asset-states",
            `Writing ${stateRecords.length} asset states → ${path.basename(statesShard)}`,
            { count: stateRecords.length },
          );
          const res = await writer.writeShard("asset_states", stateRecords as readonly object[], {
            year,
            runId,
          });
          assetStatesShard = { shardPath: res.shardPath, count: res.count, skipped: false };
        }
      }
    } finally {
      db.close();
    }

    // Record skipped shards (already on disk) in the vault manifest so planned
    // verification can later catch a MISSING shard (WP10). Shards written via
    // writeShard are already recorded atomically; only skipped ones need recording.
    let recorded = 0;
    for (const r of results) {
      if (!r.shardPath || r.count === 0 || !r.skipped) continue;
      await writer.recordShard("observations", r.shardPath, {
        year,
        runId: r.factoryRunId,
        rows: r.count,
      });
      recorded++;
    }
    if (assetStatesShard?.shardPath && assetStatesShard.count > 0 && assetStatesShard.skipped) {
      await writer.recordShard("asset_states", assetStatesShard.shardPath, {
        year,
        runId,
        rows: assetStatesShard.count,
      });
      recorded++;
    }
    if (recorded > 0) {
      log.info("manifest-updated", `Recorded ${recorded} skipped shard(s) in the vault manifest`, {
        recorded,
      });
    }

    const totalWritten = results.filter((r) => !r.skipped).reduce((s, r) => s + r.count, 0);
    const shardsWritten = results.filter((r) => !r.skipped).length;

    log.info(
      "write-finished",
      `Done. ${shardsWritten} shard(s) written, ${totalWritten} observations.`,
      { shardsWritten, totalWritten },
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "vault-write-report.json"),
      JSON.stringify(
        {
          observatory_run_id: runId,
          vault_dir: vaultDir,
          year,
          shards: results,
          total_written: totalWritten,
          shards_written: shardsWritten,
          shards_skipped: results.filter((r) => r.skipped).length,
          asset_states: assetStatesShard,
        },
        null,
        2,
      ),
    );
  }
}
