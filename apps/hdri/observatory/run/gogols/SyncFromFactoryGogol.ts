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
  <item>Resolve exactly one period-and-capsule-addressed Factory emit bundle.</item>
  <item>Store gewerk_group from emitted asset states for downstream industry cohorting.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
  <item>Persist source bundle metadata on synced runs and show single-line progress while inserting large bundles.</item>
  <item>Fix checkBundle to include observatory_run_id, so re-running the observatory pipeline after a codebook change correctly syncs the bundle for the new run.</item>
  <item>WP1: stream observations in bounded chunks instead of buffering whole bundles (avoids OOM at ~100k-site Q3 scale); dedup asset states across all bundles of a run (last-wins) to prevent the (asset_id, valid_from) PK collision on multi-bundle/multi-device syncs; write synced_bundles idempotency markers last for crash-safe partial syncs.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: emit-bundle contract is immutable; never change manifest schema without version bump

import path from "node:path";
import {
  readEmitBundle,
  streamAssetStates,
  streamEvidence,
  streamObservations,
} from "@syrokomskyi/observatory-emit";
import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { getDeviceId } from "@syrokomskyi/observatory-crypto";
import { VaultReader } from "@syrokomskyi/observatory-vault";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { OBS_CHUNK, streamInsertObservations, writeAssetStatesDeduped } from "../db/sync-writers";
import { outputRootDir } from "../config";
import {
  collectPanelEligibleAssetIds,
  filterPanelEligibleObservations,
} from "../eligibility/panel-eligibility";

type BundleResult = {
  emitDir: string;
  factoryRunId: string;
  appId: string;
  obsInserted: number;
  assetStatesInserted: number;
  observationsIgnoredNeverLive: number;
  assetStatesIgnoredNeverLive: number;
  evidenceRecordsVerified: number;
  skipped: boolean;
};

export class SyncFromFactoryGogol extends Gogol {
  override readonly id = "sync-from-factory";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id — setup-observatory-run must run first");
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

    const deviceId = getDeviceId();
    const capsuleDir = path.join(
      brief.factoryContractRootDir,
      ".output",
      deviceId,
      "capsules",
      brief.period,
      brief.capsuleId,
    );
    const emitDirs = [path.join(capsuleDir, "artifacts", "emit")];
    ctx.state.capsuleDir = capsuleDir;

    const db = openObservatoryDb(year);
    const results: BundleResult[] = [];
    const locallyAccepted = db
      .prepare("SELECT provisional_id FROM asset_id_map")
      .pluck()
      .all() as string[];
    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");
    const previouslyAccepted = new Set([
      ...locallyAccepted,
      ...(await new VaultReader(vaultDir).getIdentityMap()).keys(),
    ]);

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
        if (manifest.period !== brief.period || manifest.run_id !== brief.capsuleId) {
          throw new Error("Factory emit manifest does not match the configured quarter capsule");
        }

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
            observationsIgnoredNeverLive: 0,
            assetStatesIgnoredNeverLive: 0,
            evidenceRecordsVerified: 0,
            skipped: true,
          });
          continue;
        }

        log.info("syncing-bundle", `Syncing ${manifest.app_id} run_id=${manifest.run_id}`, {
          appId: manifest.app_id,
          factoryRunId: manifest.run_id,
          observationCount: manifest.observation_count,
          assetStateCount: manifest.asset_state_count,
        });

        const admission = await collectPanelEligibleAssetIds(
          streamObservations(bundle),
          previouslyAccepted,
        );
        if (admission.observationsScanned !== manifest.observation_count) {
          throw new Error("Factory observation count changed during panel admission scan");
        }
        let observationsIgnoredNeverLive = 0;
        // ── Stream + chunk-insert admitted observations (bounded memory) ───────
        const { inserted: obsInserted, seen: obsSeen } = await streamInsertObservations(
          db,
          filterPanelEligibleObservations(
            streamObservations(bundle),
            admission.eligibleAssetIds,
            () => observationsIgnoredNeverLive++,
          ),
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
        let assetStatesIgnoredNeverLive = 0;
        for await (const st of streamAssetStates(bundle)) {
          assetSeen += 1;
          if (admission.eligibleAssetIds.has(st.asset_id)) {
            assetStateById.set(st.asset_id, { record: st, period: manifest.period });
          } else {
            assetStatesIgnoredNeverLive++;
          }
        }
        let evidenceRecordsVerified = 0;
        for await (const _evidence of streamEvidence(bundle)) {
          evidenceRecordsVerified++;
        }

        bundleRecords.push({
          runId: manifest.run_id,
          appId: manifest.app_id,
          period: manifest.period,
          emittedAt: manifest.emitted_at,
          obsCount: obsSeen,
          bundleHash: manifest.bundle_hash,
          assetStateCount: assetSeen - assetStatesIgnoredNeverLive,
        });

        log.info(
          "bundle-read",
          `Read bundle: ${obsInserted}/${obsSeen} new obs, ${assetSeen} asset states`,
          {
            factoryRunId: manifest.run_id,
            obsInserted,
            obsSeen,
            assetStatesSeen: assetSeen,
            observationsIgnoredNeverLive,
            assetStatesIgnoredNeverLive,
            evidenceRecordsVerified,
          },
        );
        results.push({
          emitDir,
          factoryRunId: manifest.run_id,
          appId: manifest.app_id,
          obsInserted,
          assetStatesInserted: assetSeen,
          observationsIgnoredNeverLive,
          assetStatesIgnoredNeverLive,
          evidenceRecordsVerified,
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
