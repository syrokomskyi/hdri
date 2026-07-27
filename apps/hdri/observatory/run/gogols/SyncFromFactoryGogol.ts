/*
<MODULE_CONTRACT>
<purpose>Syncs observations and asset states from factory emit-bundles into the observatory DB.</purpose>
<non-goals>
  <item>Does not read factory SQLite databases directly.</item>
  <item>Does not sign observations — that is done by SignObservationsGogol (P0.2.9).</item>
  <item>Does not resolve provisional asset_ids to UUIDv7 — that is a future task.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: emit-bundle → observatory DB sync (P0.2.8).</item>
  <item>Add asset state ingestion from bundle asset-states.ndjson.</item>
  <item>P0.4: auto-discover emit bundle via factoryContractRootDir; write period, factory_run_id, crawl_hash; store run_id as observatory runId.</item>
  <item>Store gewerk_group from emitted asset states for downstream industry cohorting.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
  <item>Fix auto-discovery path: look for manifest.json at .output/&lt;DEVICE_ID&gt;/ level instead of inside emit/&lt;period&gt;/, since readEmitBundle now resolves data files via manifest.emit_dir.</item>
  <item>Persist source bundle metadata on synced runs and show single-line progress while inserting large bundles.</item>
  <item>Fix checkBundle to include observatory_run_id, so re-running the observatory pipeline after a codebook change correctly syncs the bundle for the new run.</item>
  <item>WP1: stream observations in bounded chunks instead of buffering whole bundles (avoids OOM at ~100k-site Q3 scale); dedup asset states across all bundles of a run (last-wins) to prevent the (asset_id, valid_from) PK collision on multi-bundle/multi-device syncs; write synced_bundles idempotency markers last for crash-safe partial syncs.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: emit-bundle contract is immutable; never change manifest schema without version bump

import path from "node:path";
import fsp from "node:fs/promises";
import {
  readEmitBundle,
  streamAssetStates,
  streamObservations,
} from "@syrokomskyi/observatory-emit";
import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { getDeviceId } from "@syrokomskyi/observatory-crypto";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { OBS_CHUNK, streamInsertObservations, writeAssetStatesDeduped } from "../db/sync-writers";

type BundleResult = {
  emitDir: string;
  factoryRunId: string;
  appId: string;
  obsInserted: number;
  assetStatesInserted: number;
  skipped: boolean;
};

export class SyncFromFactoryGogol extends Gogol {
  override readonly id = "sync-from-factory";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id — setup-observatory-run must run first");
    }
    const { brief } = ctx.state;
    if (
      !brief.factoryContractDir &&
      !brief.factoryContractRootDir &&
      !brief.factoryEmitDirs?.length
    ) {
      throw new Error(
        "brief.factoryContractDir, factoryContractRootDir, or factoryEmitDirs must be set",
      );
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    // validateBeforeStart guarantees runId is set; narrow it for the writers.
    const runId = ctx.state.runId!;
    const year = parsePeriod(brief.period).year;
    const now = new Date().toISOString();
    const log = createJsonLogger({
      app: "observatory",
      pipeline: "observatory",
    }).withContext({ gogol: this.id });

    // Phase A: resolve single contract bundle path — explicit dir, auto-discovery, or legacy fallback.
    const emitDirs: string[] = await resolveEmitDirs(brief, log);

    const db = openObservatoryDb(year);
    const results: BundleResult[] = [];

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

    const checkBundle = db.prepare(
      `SELECT 1 FROM synced_bundles WHERE run_id = ? AND observatory_run_id = ?`,
    );

    // Asset states are bounded by the number of distinct assets (~100k), so they
    // are deduped across ALL bundles of this run (last-write-wins) into one map.
    // This both bounds memory and prevents the (asset_id, valid_from = now)
    // PRIMARY KEY collision that crashed sync when an asset appeared in more than
    // one bundle within a run (multi-device / sharded harvest).
    const assetStateById = new Map<string, { record: AssetStateRecord; period: string }>();
    const bundleRecords: Array<{
      runId: string;
      appId: string;
      period: string;
      emittedAt: string;
      obsCount: number;
      bundleHash: string | null;
      assetStateCount: number;
    }> = [];

    try {
      for (const emitDir of emitDirs) {
        const bundle = await readEmitBundle(emitDir);
        const { manifest } = bundle;

        if (checkBundle.get(manifest.run_id, runId)) {
          log.info("bundle-already-synced", `run_id=${manifest.run_id} already synced — skipping`, {
            factoryRunId: manifest.run_id,
            appId: manifest.app_id,
          });
          results.push({
            emitDir,
            factoryRunId: manifest.run_id,
            appId: manifest.app_id,
            obsInserted: 0,
            assetStatesInserted: 0,
            skipped: true,
          });
          continue;
        }

        log.info("syncing-bundle", `Syncing ${manifest.app_id} run_id=${manifest.run_id}`, {
          appId: manifest.app_id,
          factoryRunId: manifest.run_id,
          observationCount: manifest.observation_count,
          assetStateCount: manifest.asset_state_count ?? 0,
        });

        // ── Stream + chunk-insert observations (bounded memory) ────────────────
        const { inserted: obsInserted, seen: obsSeen } = await streamInsertObservations(
          db,
          streamObservations(bundle),
          {
            runId,
            ontologyVersion: manifest.ontology_version,
            period: manifest.period,
            factoryRunId: manifest.run_id,
            onProgress: (seen) =>
              logProgress(this.id, seen, manifest.observation_count, OBS_CHUNK, true),
          },
        );

        // ── Stream asset states → dedup into the run-level map (last-wins) ──────
        let assetSeen = 0;
        for await (const st of streamAssetStates(bundle)) {
          assetStateById.set(st.asset_id, { record: st, period: manifest.period });
          assetSeen += 1;
        }

        bundleRecords.push({
          runId: manifest.run_id,
          appId: manifest.app_id,
          period: manifest.period,
          emittedAt: manifest.emitted_at,
          obsCount: manifest.observation_count,
          bundleHash: manifest.bundle_hash,
          assetStateCount: manifest.asset_state_count ?? assetSeen,
        });

        log.info(
          "bundle-read",
          `Read bundle: ${obsInserted}/${obsSeen} new obs, ${assetSeen} asset states`,
          {
            factoryRunId: manifest.run_id,
            obsInserted,
            obsSeen,
            assetStatesSeen: assetSeen,
          },
        );
        results.push({
          emitDir,
          factoryRunId: manifest.run_id,
          appId: manifest.app_id,
          obsInserted,
          assetStatesInserted: assetSeen,
          skipped: false,
        });
      }

      // ── Write deduped asset states once (SCD-2: expire prior open row, insert) ─
      writeAssetStatesDeduped(db, assetStateById.values(), {
        runId,
        now,
        onProgress: (done, total) =>
          logProgress(`${this.id}:asset-states`, done, total, 1000, true),
      });

      // ── Write idempotency markers LAST, so a crash mid-sync never marks a
      //    bundle as synced without its data being fully present. ───────────────
      const writeMarkers = db.transaction(() => {
        for (const b of bundleRecords) {
          insertBundle.run(
            b.runId,
            b.appId,
            b.period,
            b.emittedAt,
            b.obsCount,
            now,
            runId,
            b.bundleHash,
            b.assetStateCount,
          );
          updateRunBundleMeta.run(b.runId, b.bundleHash, runId);
        }
      });
      writeMarkers();
    } finally {
      db.close();
    }

    const totalInserted = results.reduce((s, r) => s + r.obsInserted, 0);
    // Actual asset_states rows written = deduped distinct assets across all
    // non-skipped bundles (per-bundle results count assets *seen*, which can
    // exceed rows written when an asset appears in more than one bundle).
    const totalAssetInserted = assetStateById.size;
    ctx.state.observationCount = (ctx.state.observationCount ?? 0) + totalInserted;

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "sync-report.json"),
      JSON.stringify(
        {
          observatory_run_id: runId,
          bundles: results,
          total_inserted: totalInserted,
          total_asset_states_inserted: totalAssetInserted,
          synced_at: now,
        },
        null,
        2,
      ),
    );

    log.info(
      "sync-finished",
      `Done. ${totalInserted} obs, ${totalAssetInserted} asset states from ${results.length} bundle(s).`,
      {
        totalInserted,
        totalAssetStatesInserted: totalAssetInserted,
        bundleCount: results.length,
      },
    );
  }
}

/**
 * Resolves emit-bundle directories in priority order:
 * 1. explicit factoryContractDir
 * 2. auto-discovered from factoryContractRootDir + DEVICE_ID + period
 * 3. legacy factoryEmitDirs
 */
async function resolveEmitDirs(
  brief: import("../brief").Brief,
  log: import("@syrokomskyi/pipeline-core").JsonLogger,
): Promise<string[]> {
  if (brief.factoryContractDir) {
    return [brief.factoryContractDir];
  }

  if (brief.factoryContractRootDir) {
    const deviceId = getDeviceId();
    const autoDir = path.join(brief.factoryContractRootDir, ".output", deviceId);
    try {
      await fsp.access(path.join(autoDir, "manifest.json"));
      log.info("auto-discovered-bundle", `Auto-discovered bundle: ${autoDir}`, { autoDir });
      return [autoDir];
    } catch {
      log.warn(
        "auto-discover-fallback",
        `factoryContractRootDir set but no manifest.json found at ${autoDir} — falling back to factoryEmitDirs`,
        { autoDir },
      );
    }
  }

  return brief.factoryEmitDirs;
}
