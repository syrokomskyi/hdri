/*
<MODULE_CONTRACT>
<purpose>Resolves provisional da-* asset IDs to canonical asset IDs that are STABLE ACROSS YEARS,
by resolving against a cross-year, append-only identity registry stored in the vault before
minting. Persists the mapping locally (asset_id_map) for downstream joins and appends only the
newly-minted identities to the registry.</purpose>
<non-goals>
  <item>Does not rewrite existing observation or asset_state records — IDs are immutable.</item>
  <item>Does not re-mint an id the registry already knows — that is the whole point (cross-year stability).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation (P3): provisional → canonical asset ID resolution.</item>
  <item>WP12: resolve against a cross-year vault registry before minting, so the same domain keeps
        the same canonical id across years; append only new mints to the registry.</item>
  <item>WP12 fix: also seed resolution from the local asset_id_map and heal any pre-registry
        identity (the Q2 baseline, minted before the registry existed) into the vault registry, so
        cross-year identity holds even when the registry starts empty for those businesses.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import fsp from "node:fs/promises";
import path from "node:path";
import { parsePeriod, type IdentityRequest } from "@syrokomskyi/observatory-core";
import { planIdentityResolution } from "../mint/mint-core";
import {
  VaultReader,
  VaultWriter,
  identityShardPath,
  type VaultAssetIdentityRecord,
} from "@syrokomskyi/observatory-vault";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { outputRootDir } from "../config";
import { materializeAvailabilityTransitions } from "../availability/availability-store";

type AssetRow = {
  asset_id: string;
  domain: string;
};

export class MintAssetIdsGogol extends Gogol {
  override readonly id = "mint-asset-ids";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const year = parsePeriod(brief.period).year;
    const now = new Date().toISOString();
    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");

    // 1. Load the accumulated cross-year registry (provisional → canonical), all years.
    const vaultRegistry = await new VaultReader(vaultDir).getIdentityMap();

    const db = openObservatoryDb(year);
    let reused: number;
    let minted: number;
    let backfilled: number;
    let newRecords: VaultAssetIdentityRecord[];
    let availabilityEvents: number;

    try {
      // 2. Collect distinct provisional (asset_id, domain) pairs. asset_states carries the
      //    domain; observation-only assets have no domain (empty string), and are listed
      //    after so a known domain from asset_states wins the de-dup.
      const assets = db
        .prepare(
          `SELECT DISTINCT asset_id, domain FROM asset_states
           WHERE asset_id LIKE 'da-%' ORDER BY asset_id`,
        )
        .all() as AssetRow[];

      const obsAssets = db
        .prepare(
          `SELECT DISTINCT asset_id FROM observations
           WHERE asset_id LIKE 'da-%'
             AND asset_id NOT IN (SELECT asset_id FROM asset_states)`,
        )
        .all() as { asset_id: string }[];

      const requests: IdentityRequest[] = [
        ...assets.map((a) => ({ provisionalId: a.asset_id, domain: a.domain })),
        ...obsAssets.map((a) => ({ provisionalId: a.asset_id, domain: "" })),
      ];

      // 2b. Local authoritative map: canonical ids ALREADY assigned in this year's DB — in
      //     particular the published Q2 baseline, whose ids were minted before the cross-year
      //     vault registry existed (WP12a is newer than Q2). The vault registry is therefore
      //     EMPTY for those businesses; resolving against it alone would re-mint a fresh
      //     canonical id for every returning Q2 asset and diverge from the published identity.
      const localRows = db
        .prepare(`SELECT provisional_id, canonical_id, domain FROM asset_id_map`)
        .all() as Array<{ provisional_id: string; canonical_id: string; domain: string }>;
      const localMap = new Map(localRows.map((r) => [r.provisional_id, r.canonical_id]));
      const localDomain = new Map(localRows.map((r) => [r.provisional_id, r.domain]));

      // True first-seen period for a backfilled identity: the earliest period the asset
      // appears in (so a Q2 business healed during a Q3 run is recorded as first seen in Q2,
      // not Q3). Observation-only assets fall back to the current brief period.
      const firstSeenRows = db
        .prepare(
          `SELECT asset_id, MIN(period) AS period FROM asset_states
            WHERE asset_id LIKE 'da-%' AND period IS NOT NULL GROUP BY asset_id`,
        )
        .all() as Array<{ asset_id: string; period: string }>;
      const firstSeenPeriod = new Map(firstSeenRows.map((r) => [r.asset_id, r.period]));

      // 3. Resolve (seeded from local map ∪ registry) and plan the registry heal — pure core.
      const plan = planIdentityResolution({
        requests,
        vaultRegistry,
        localMap,
        localDomain,
        firstSeenPeriod,
        briefPeriod: brief.period,
        mintedAt: now,
      });
      minted = plan.minted;
      reused = plan.reused;
      backfilled = plan.backfilled;
      newRecords = plan.toRegister;

      // 4. Persist every resolved mapping locally for downstream joins (idempotent).
      const insertMap = db.prepare(`
        INSERT OR IGNORE INTO asset_id_map (provisional_id, canonical_id, domain, first_seen)
        VALUES (?, ?, ?, ?)
      `);
      const domainOf = new Map(requests.map((r) => [r.provisionalId, r.domain]));
      const doWrite = db.transaction(() => {
        for (const [provisionalId, canonicalId] of plan.resolved) {
          insertMap.run(provisionalId, canonicalId, domainOf.get(provisionalId) ?? "", now);
        }
      });
      doWrite();
      availabilityEvents = materializeAvailabilityTransitions(
        db,
        ctx.state.runId ?? "",
        brief.period,
      );
    } finally {
      db.close();
    }

    // 6. Append the planned records (new mints + healed pre-registry ids) to the cross-year
    //    registry as one shard (idempotent: skip an already-written shard for this run).
    let identityShard: { shardPath: string; count: number; skipped: boolean } = {
      shardPath: "",
      count: 0,
      skipped: true,
    };
    if (newRecords.length > 0) {
      const shardPath = identityShardPath(vaultDir, year, ctx.state.runId ?? "mint");
      try {
        await fsp.access(shardPath);
        identityShard = { shardPath, count: newRecords.length, skipped: true };
      } catch {
        const res = await new VaultWriter(vaultDir).writeShard("asset_identity", newRecords, {
          year,
          runId: ctx.state.runId ?? "mint",
        });
        identityShard = { shardPath: res.shardPath, count: res.count, skipped: false };
      }
    }

    console.log(
      `[mint-asset-ids] ${minted} new canonical IDs minted, ${reused} reused` +
        `${backfilled > 0 ? `, ${backfilled} pre-registry identity/-ies healed into the registry` : ""}.`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "mint-report.json"),
      JSON.stringify(
        {
          observatory_run_id: ctx.state.runId,
          period: brief.period,
          registry_size_before: vaultRegistry.size,
          reused_from_registry: reused,
          newly_minted: minted,
          backfilled_into_registry: backfilled,
          identity_shard: identityShard,
          minted_at: now,
          availability_events_materialized: availabilityEvents,
        },
        null,
        2,
      ),
    );
  }
}
