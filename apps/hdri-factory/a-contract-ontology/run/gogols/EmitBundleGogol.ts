/*
<MODULE_CONTRACT>
<purpose>Emits the canonical observation and asset-state bundle using EmitBundleWriter.</purpose>
<keywords>emit, bundle, manifest, observation, asset-state</keywords>
<responsibilities>
  <item>Creates an EmitBundleWriter with app metadata.</item>
  <item>Writes each signed observation to the bundle.</item>
  <item>Reads upstream core_*.db to extract asset state records.</item>
  <item>Writes each asset state record to the bundle.</item>
  <item>Commits the bundle and stores the manifest in pipeline state.</item>
</responsibilities>
<non-goals>
  <item>Do not sign observations — that is done by SignBundleGogol.</item>
  <item>Do not modify upstream databases.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="EmitBundleGogol">Gogol that writes the final observation + asset-state bundle.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add asset state harvesting from core_*.db for emit-bundle schema v2.</item>
  <item>Add gewerk_group in emitted asset states by deriving it from site_hwo_mappings with mapping_system = destatis_group.</item>
  <item>Write immutable emit bundles to .output/emit/&lt;period&gt;/&lt;factory_run_id&gt;/ and persist emit_dir in pipeline state.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import Database from 'better-sqlite3';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { deriveAssetId, newId } from '@org/observatory-core';
import type { AssetStateMapping, AssetStateRecord } from '@org/observatory-core';
import { EmitBundleWriter } from '@org/observatory-emit';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { outputRootDir } from '../config.js';

const APP_VERSION = '0.1.0';
const APP_ID = 'a-contract-ontology';
const COLLECTOR_VERSION = `${APP_ID}@${APP_VERSION}`;

type CoreSite = {
  id: number;
  domain: string;
  hwo_uid: string | null;
  hwo_provenance: string | null;
  bundesland: string | null;
  gemeinde: string | null;
};

type CoreMapping = {
  site_id: number;
  mapping_system: string;
  target_code: string;
  target_label: string | null;
  source: string;
};

type SiteIndustryGroup = {
  site_id: number;
  gewerk_group: string | null;
};

export class EmitBundleGogol extends Gogol {
  override readonly id = 'emit-bundle';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, signed, coreDbs } = ctx.state;
    if (signed.length === 0) throw new Error('No signed observations — run sign-bundle first');

    const factoryRunId = newId();
    const emitPeriodDir = path.join(outputRootDir, 'emit', brief.period);
    const emitDir = path.join(emitPeriodDir, factoryRunId);
    await fsp.mkdir(emitPeriodDir, { recursive: true });

    const writer = new EmitBundleWriter(emitDir, {
      app_id: APP_ID,
      collector_version: COLLECTOR_VERSION,
      ruleset_version: brief.ontologyVersion,
      ontology_version: brief.ontologyVersion,
      run_id: factoryRunId,
      period: brief.period,
    });
    await writer.open();

    // ── Write observations ────────────────────────────────────────────────────
    for (const obs of signed) writer.writeObservation(obs);

    // ── Write asset states from upstream core_*.db ────────────────────────────
    let assetStateCount = 0;
    for (const coreDb of coreDbs) {
      const { records } = readAssetStates(coreDb.coreDbPath);
      for (const rec of records) {
        writer.writeAssetState(rec);
        assetStateCount++;
      }
    }
    if (coreDbs.length > 0) {
      console.log(`[emit-bundle] Harvested ${assetStateCount} asset state(s) from ${coreDbs.length} core DB(s)`);
    }

    const manifest = await writer.commit();
    const manifestWithDir = {
      ...manifest,
      emit_dir: emitDir,
    };

    // Write manifest as step artifact.
    await fsp.writeFile(
      path.join(ctx.outputDir, 'manifest.json'),
      JSON.stringify(manifestWithDir, null, 2),
      'utf-8',
    );

    const bundleHash = manifest.bundle_hash ?? '';
    console.log(
      `[emit-bundle] Wrote ${manifest.observation_count} observations, ${manifest.asset_state_count ?? 0} asset states to ${emitDir}\n` +
      `[emit-bundle] bundle_hash=${bundleHash.slice(0, 16)}…`,
    );

    ctx.state.manifest = manifestWithDir;
  }
}

// ── Standalone helpers tested independently ───────────────────────────────────

export function readAssetStates(coreDbPath: string): {
  records: AssetStateRecord[];
} {
  const db = new Database(coreDbPath, { readonly: true });

  let sites: CoreSite[];
  let mappings: CoreMapping[];
  let industryGroups: SiteIndustryGroup[];
  try {
    sites = db.prepare(
      `SELECT id, domain, hwo_uid, hwo_provenance, bundesland, gemeinde FROM sites ORDER BY id`,
    ).all() as CoreSite[];

    mappings = db.prepare(
      `SELECT site_id, mapping_system, target_code, target_label, source FROM site_hwo_mappings`,
    ).all() as CoreMapping[];

    industryGroups = db.prepare(
      `SELECT site_id, target_code AS gewerk_group
       FROM site_hwo_mappings
       WHERE mapping_system = 'destatis_group'`,
    ).all() as SiteIndustryGroup[];
  } finally {
    db.close();
  }

  // Group mappings by site_id
  const mappingBySite = new Map<number, AssetStateMapping[]>();
  for (const m of mappings) {
    let list = mappingBySite.get(m.site_id);
    if (!list) {
      list = [];
      mappingBySite.set(m.site_id, list);
    }
    list.push({
      mapping_system: m.mapping_system,
      target_code: m.target_code,
      target_label: m.target_label,
      source: m.source,
    });
  }

  const gewerkGroupBySite = new Map<number, string | null>();
  for (const row of industryGroups) {
    gewerkGroupBySite.set(row.site_id, row.gewerk_group);
  }

  const records: AssetStateRecord[] = [];
  for (const site of sites) {
    records.push({
      asset_id: deriveAssetId(site.domain),
      domain: site.domain,
      gewerk_group: gewerkGroupBySite.get(site.id) ?? null,
      hwo_uid: site.hwo_uid,
      hwo_provenance: site.hwo_provenance,
      bundesland: site.bundesland,
      gemeinde: site.gemeinde,
      mappings: mappingBySite.get(site.id) ?? [],
    });
  }

  return { records };
}
