/*
<MODULE_CONTRACT>
<purpose>Resolves provisional da_* asset IDs (SHA-256 hash) to canonical UUIDv7 asset IDs,
storing the mapping in asset_id_map for use by downstream analytics and vault readers.</purpose>
<keywords>asset-id, uuid, resolution, mapping, uuidv7</keywords>
<responsibilities>
  <item>Reads all distinct provisional asset_ids from asset_states and observations.</item>
  <item>For each provisional_id not yet in asset_id_map, mints a UUIDv7 via mintAssetId().</item>
  <item>Inserts the mapping (provisional → canonical, domain, first_seen) into asset_id_map.</item>
  <item>Writes mint-report.json artifact with counts.</item>
</responsibilities>
<non-goals>
  <item>Does not rewrite existing observation or asset_state records — IDs are immutable.</item>
  <item>Does not write to the vault — the mapping is stored in the observatory DB only.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="MintAssetIdsGogol">Resolves provisional da_* IDs to canonical UUIDv7 asset IDs.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation (P3): provisional → canonical asset ID resolution.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { mintAssetId } from '@org/observatory-asset-id';
import { parsePeriod } from '@org/observatory-core';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';

type AssetRow = {
  asset_id: string;
  domain: string;
};

export class MintAssetIdsGogol extends Gogol {
  override readonly id = 'mint-asset-ids';

  override async run(ctx: PipelineContext): Promise<void> {
    const year = parsePeriod(ctx.state.brief.period).year;
    const now = new Date().toISOString();

    const db = openObservatoryDb(year);
    let minted = 0;
    let alreadyMapped = 0;

    try {
      // Collect distinct (asset_id, domain) pairs from asset_states
      // Observations only store asset_id without domain, so asset_states is the join key
      const assets = db.prepare(`
        SELECT DISTINCT asset_id, domain
        FROM asset_states
        WHERE asset_id LIKE 'da-%'
        ORDER BY asset_id
      `).all() as AssetRow[];

      // Also pick up any observation asset_ids not yet in asset_states
      const obsAssets = db.prepare(`
        SELECT DISTINCT asset_id
        FROM observations
        WHERE asset_id LIKE 'da-%'
          AND asset_id NOT IN (SELECT asset_id FROM asset_states)
      `).all() as { asset_id: string }[];

      const insertMap = db.prepare(`
        INSERT OR IGNORE INTO asset_id_map (provisional_id, canonical_id, domain, first_seen)
        VALUES (?, ?, ?, ?)
      `);

      const checkMap = db.prepare(`SELECT 1 FROM asset_id_map WHERE provisional_id = ?`);

      const doMint = db.transaction(() => {
        for (const { asset_id, domain } of assets) {
          if (checkMap.get(asset_id)) { alreadyMapped++; continue; }
          insertMap.run(asset_id, mintAssetId(), domain, now);
          minted++;
        }
        // Observation-only assets (no domain known) — use empty string for domain
        for (const { asset_id } of obsAssets) {
          if (checkMap.get(asset_id)) { alreadyMapped++; continue; }
          insertMap.run(asset_id, mintAssetId(), '', now);
          minted++;
        }
      });

      doMint();
    } finally {
      db.close();
    }

    console.log(`[mint-asset-ids] ${minted} new canonical IDs minted, ${alreadyMapped} already mapped.`);

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'mint-report.json'),
      JSON.stringify({
        observatory_run_id: ctx.state.runId,
        minted,
        already_mapped: alreadyMapped,
        minted_at: now,
      }, null, 2),
    );
  }
}
