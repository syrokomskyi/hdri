/*
<MODULE_CONTRACT>
<purpose>Syncs observations and asset states from factory emit-bundles into the observatory DB.</purpose>
<keywords>sync, emit-bundle, factory, observations, asset-states, idempotent</keywords>
<responsibilities>
  <item>Reads each emit-bundle listed in brief.factoryEmitDirs via readEmitBundle / streamObservations.</item>
  <item>Skips bundles whose run_id is already in synced_bundles (idempotent).</item>
  <item>Batch-inserts observations into the observatory observations table (INSERT OR IGNORE).</item>
  <item>Reads asset-states.ndjson via streamAssetStates and inserts into asset_states + asset_hwo_mappings.</item>
  <item>Records each synced bundle in synced_bundles for idempotency tracking.</item>
  <item>Writes sync-report.json artifact with per-bundle counts.</item>
</responsibilities>
<non-goals>
  <item>Does not read factory SQLite databases directly.</item>
  <item>Does not sign observations — that is done by SignObservationsGogol (P0.2.9).</item>
  <item>Does not resolve provisional asset_ids to UUIDv7 — that is a future task.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SyncFromFactoryGogol">Gogol that ingests factory emit-bundles into the observatory.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: emit-bundle → observatory DB sync (P0.2.8).</item>
  <item>Add asset state ingestion from bundle asset-states.ndjson.</item>
  <item>P0.4: auto-discover emit bundle via factoryContractRootDir; write period, factory_run_id, crawl_hash; store run_id as observatory runId.</item>
  <item>Store gewerk_group from emitted asset states for downstream industry cohorting.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Fix auto-discovery path: look for manifest.json at .output/&lt;DEVICE_ID&gt;/ level instead of inside emit/&lt;period&gt;/, since readEmitBundle now resolves data files via manifest.emit_dir.</item>
  <item>Persist source bundle metadata on synced runs and show single-line progress while inserting large bundles.</item>
  <item>Fix checkBundle to include observatory_run_id, so re-running the observatory pipeline after a codebook change correctly syncs the bundle for the new run.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import fsp from 'node:fs/promises';
import {
  readEmitBundle,
  streamAssetStates,
  streamObservations,
} from '@org/observatory-emit';
import type { AssetStateRecord, Observation } from '@org/observatory-core';
import { parsePeriod } from '@org/observatory-core';
import { getDeviceId } from '@org/observatory-crypto';
import { createJsonLogger } from '@org/pipeline-core';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';

type BundleResult = {
  emitDir: string;
  factoryRunId: string;
  appId: string;
  obsInserted: number;
  assetStatesInserted: number;
  skipped: boolean;
};

export class SyncFromFactoryGogol extends Gogol {
  override readonly id = 'sync-from-factory';

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error('Missing run_id — setup-observatory-run must run first');
    }
    const { brief } = ctx.state;
    if (!brief.factoryContractDir && !brief.factoryContractRootDir && !brief.factoryEmitDirs?.length) {
      throw new Error(
        'brief.factoryContractDir, factoryContractRootDir, or factoryEmitDirs must be set',
      );
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { runId, brief } = ctx.state;
    const year = parsePeriod(brief.period).year;
    const now = new Date().toISOString();
    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    // Phase A: resolve single contract bundle path — explicit dir, auto-discovery, or legacy fallback.
    const emitDirs: string[] = await resolveEmitDirs(brief, log);

    const db = openObservatoryDb(year);
    const results: BundleResult[] = [];

    const insertObs = db.prepare(`
      INSERT OR IGNORE INTO observations
        (id, asset_id, signal_path, ontology_version, value_bool, value_num,
         value_str, value_json, value_type, observed_at, recorded_at, run_id,
         evidence_ref, extractor_version, confidence, status, obs_json,
         collection_status, period, factory_run_id, crawl_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBundle = db.prepare(`
      INSERT OR IGNORE INTO synced_bundles
        (run_id, app_id, period, emitted_at, obs_count, synced_at, observatory_run_id, bundle_hash, asset_state_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateRunBundleMeta = db.prepare(`
      UPDATE pipeline_runs
      SET factory_run_id = ?, bundle_hash = ?
      WHERE run_id = ?
    `);

    const checkBundle = db.prepare(`SELECT 1 FROM synced_bundles WHERE run_id = ? AND observatory_run_id = ?`);

    // ── Asset state statements ────────────────────────────────────────────────
    const expireOld = db.prepare(`
      UPDATE asset_states SET valid_to = ? WHERE asset_id = ? AND valid_to IS NULL
    `);

    const insertAsset = db.prepare(`
      INSERT INTO asset_states
        (asset_id, domain, gewerk_group, hwo_uid, hwo_provenance, bundesland, gemeinde, valid_from, valid_to, run_id, period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `);

    const insertMapping = db.prepare(`
      INSERT OR REPLACE INTO asset_hwo_mappings
        (asset_id, mapping_system, target_code, target_label, source, run_id, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const emitDir of emitDirs) {
        const bundle = await readEmitBundle(emitDir);
        const { manifest } = bundle;

        if (checkBundle.get(manifest.run_id, runId)) {
          log.info('bundle-already-synced', `run_id=${manifest.run_id} already synced — skipping`, { factoryRunId: manifest.run_id, appId: manifest.app_id });
          results.push({
            emitDir, factoryRunId: manifest.run_id, appId: manifest.app_id,
            obsInserted: 0, assetStatesInserted: 0, skipped: true,
          });
          continue;
        }

        log.info('syncing-bundle', `Syncing ${manifest.app_id} run_id=${manifest.run_id}`, {
          appId: manifest.app_id,
          factoryRunId: manifest.run_id,
          observationCount: manifest.observation_count,
          assetStateCount: manifest.asset_state_count ?? 0,
        });

        // ── Collect observations ──────────────────────────────────────────────
        const observations: Observation[] = [];
        for await (const obs of streamObservations(bundle)) {
          observations.push(obs);
        }

        // ── Collect asset states ──────────────────────────────────────────────
        const assetStates: AssetStateRecord[] = [];
        for await (const st of streamAssetStates(bundle)) {
          assetStates.push(st);
        }

        const batchInsert = db.transaction(() => {
          let obsInserted = 0;
          for (const [index, obs] of observations.entries()) {
            const r = insertObs.run(
              obs.observation_id,
              obs.asset_id,
              obs.signal_path,
              manifest.ontology_version,
              obs.value_bool === null ? null : (obs.value_bool ? 1 : 0),
              obs.value_num,
              obs.value_str,
              obs.value_json,
              obs.value_type,
              obs.observed_at,
              obs.recorded_at,
              runId,
              obs.evidence_ref,
              obs.probe_version,
              obs.confidence,
              obs.status,
              JSON.stringify(obs),
              obs.collection_status ?? null,
              manifest.period,
              manifest.run_id,
              obs.crawl_hash ?? null,
            );
            obsInserted += r.changes;
            logProgress(this.id, index + 1, observations.length, 10000, true);
          }

          let assetInserted = 0;
          for (const [index, st] of assetStates.entries()) {
            // Expire current SCD-2 row
            expireOld.run(now, st.asset_id);
            // Insert new row
            insertAsset.run(
              st.asset_id,
              st.domain,
              st.gewerk_group,
              st.hwo_uid,
              st.hwo_provenance,
              st.bundesland,
              st.gemeinde,
              now,
              runId,
              manifest.period,
            );
            // Insert mappings
            for (const m of st.mappings) {
              insertMapping.run(
                st.asset_id,
                m.mapping_system,
                m.target_code,
                m.target_label,
                m.source,
                runId,
                now,
              );
            }
            assetInserted++;
            logProgress(`${this.id}:asset-states`, index + 1, assetStates.length, 1000, true);
          }

          insertBundle.run(
            manifest.run_id,
            manifest.app_id,
            manifest.period,
            manifest.emitted_at,
            manifest.observation_count,
            now,
            runId,
            manifest.bundle_hash,
            manifest.asset_state_count ?? assetStates.length,
          );

          updateRunBundleMeta.run(
            manifest.run_id,
            manifest.bundle_hash,
            runId,
          );

          return { obsInserted, assetInserted };
        });

        const { obsInserted, assetInserted } = batchInsert();
        log.info('bundle-inserted', `Inserted ${obsInserted}/${observations.length} obs, ${assetInserted}/${assetStates.length} asset states`, {
          factoryRunId: manifest.run_id,
          obsInserted,
          obsTotal: observations.length,
          assetStatesInserted: assetInserted,
          assetStatesTotal: assetStates.length,
        });
        results.push({
          emitDir, factoryRunId: manifest.run_id, appId: manifest.app_id,
          obsInserted, assetStatesInserted: assetInserted, skipped: false,
        });
      }
    } finally {
      db.close();
    }

    const totalInserted = results.reduce((s, r) => s + r.obsInserted, 0);
    const totalAssetInserted = results.reduce((s, r) => s + r.assetStatesInserted, 0);
    ctx.state.observationCount = (ctx.state.observationCount ?? 0) + totalInserted;

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'sync-report.json'),
      JSON.stringify({
        observatory_run_id: runId,
        bundles: results,
        total_inserted: totalInserted,
        total_asset_states_inserted: totalAssetInserted,
        synced_at: now,
      }, null, 2),
    );

    log.info('sync-finished', `Done. ${totalInserted} obs, ${totalAssetInserted} asset states from ${results.length} bundle(s).`, {
      totalInserted,
      totalAssetStatesInserted: totalAssetInserted,
      bundleCount: results.length,
    });
  }
}

/**
 * Resolves emit-bundle directories in priority order:
 * 1. explicit factoryContractDir
 * 2. auto-discovered from factoryContractRootDir + DEVICE_ID + period
 * 3. legacy factoryEmitDirs
 */
async function resolveEmitDirs(
  brief: import('../brief').Brief,
  log: import('@org/pipeline-core').JsonLogger,
): Promise<string[]> {
  if (brief.factoryContractDir) {
    return [brief.factoryContractDir];
  }

  if (brief.factoryContractRootDir) {
    const deviceId = getDeviceId();
    const autoDir = path.join(
      brief.factoryContractRootDir,
      '.output',
      deviceId,
    );
    try {
      await fsp.access(path.join(autoDir, 'manifest.json'));
      log.info('auto-discovered-bundle', `Auto-discovered bundle: ${autoDir}`, { autoDir });
      return [autoDir];
    } catch {
      log.warn('auto-discover-fallback', `factoryContractRootDir set but no manifest.json found at ${autoDir} — falling back to factoryEmitDirs`, { autoDir });
    }
  }

  return brief.factoryEmitDirs;
}
