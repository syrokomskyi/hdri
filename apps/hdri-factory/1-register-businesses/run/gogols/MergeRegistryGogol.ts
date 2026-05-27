/*
<MODULE_CONTRACT>
<purpose>Merges distinct domains from upstream core DBs into local business_registry.</purpose>
<keywords>merge, registry, deduplication, domains</keywords>
<responsibilities>
  <item>Reads distinct domains from each discovered upstream core DB.</item>
  <item>Deduplicates domains across all devices.</item>
  <item>Mints deterministic da-* asset IDs for each unique domain.</item>
  <item>Creates local registry database with business_registry and registry_alias tables.</item>
  <item>Writes merge summary artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not modify upstream core.db files.</item>
  <item>Do not sign the registry content (handled by SignSourceGogol).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="MergeRegistryGogol">Merges upstream domains into local registry.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation extracted from monolithic main.ts.</item>
  <item>Normalise registryDbPath, localDbPath, and per-device dbPath to relative in merge-registry.json and merge-registry.md artifacts using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
  <item>Write bundesland/gemeinde into business_registry so downstream pipelines can read geographic data from registry_YYYY.db.</item>
  <item>Create sites and site_pages tables inside registry_YYYY.db (via migrateCore) and populate sites from business_registry so downstream pipelines can use registry_YYYY.db as their core.db input.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import Database from 'better-sqlite3';
import { markdownTable } from 'markdown-table';
import { deriveAssetId } from '@org/observatory-core';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir, writeJsonFile, writeTextFile } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { DomainAggregate, PipelineContext, RegistryRow } from '../pipeline/types.js';
import { migrateRegistry, stampRegistryMeta } from '../db/schema.js';
import { migrateCore, stampCoreMeta } from '@org/business-core/migrate';
import { outputRootDir } from '../config.js';

const APP_VERSION = '0.1.0';

export class MergeRegistryGogol extends Gogol {
  override readonly id = 'merge-registry';

  override readonly guide = {
    title: 'Merge registry',
    purpose: 'Read distinct domains from all upstream core DBs, deduplicate across devices, and populate local business_registry with deterministic asset IDs.',
    decisionType: 'auto' as const,
    inputs: ['Upstream core_YYYY.db files (discovered in previous step)'],
    outputs: [
      'registry_YYYY.db with business_registry and sites tables',
      'merge-registry.json',
      'merge-registry.md',
    ],
    definitionOfDone: [
      'All upstream core DBs read successfully',
      'Domains deduplicated across devices',
      'Deterministic da-* IDs assigned to each unique domain',
      'business_registry table populated with bundesland/gemeinde',
      'sites and site_pages tables created inside registry_YYYY.db for downstream compatibility',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const discovered = state.discoveredCores;

    // Ensure output directories
    const localDbDir = path.join(outputRootDir, 'data', 'db');
    await ensureOutputDir(localDbDir);
    const localDbPath = path.join(localDbDir, `registry_${state.year}.db`);

    // Open/create local registry DB
    const db = new Database(localDbPath);
    db.pragma('journal_mode = WAL');
    migrateRegistry(db);
    stampRegistryMeta(db, APP_VERSION);

    // Also create core schema (sites, site_pages) inside the same DB
    // so downstream pipelines can read registry_YYYY.db as their core input.
    migrateCore(db);
    stampCoreMeta(db, '1-register-businesses', APP_VERSION);

    const insertRegistry = db.prepare(`
      INSERT INTO business_registry
        (da_id, domain, bundesland, gemeinde, first_seen_source_token, first_seen_device_id, first_seen_at, sites_count)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
    `);

    let totalRowsRead = 0;
    const perDeviceRows: Array<{ deviceId: string; dbPath: string; distinctDomains: number }> = [];
    const aggregateByDomain = new Map<string, DomainAggregate>();

    type SiteRow = { domain: string; bundesland: string | null; gemeinde: string | null };

    for (const src of discovered) {
      const upstream = new Database(src.dbPath, { readonly: true });
      try {
        const rows = upstream.prepare(`
          SELECT DISTINCT domain, bundesland, gemeinde
          FROM sites
          WHERE domain IS NOT NULL AND length(trim(domain)) > 0
        `).all() as SiteRow[];

        perDeviceRows.push({ deviceId: src.deviceId, dbPath: src.dbPath, distinctDomains: rows.length });
        totalRowsRead += rows.length;

        for (const row of rows) {
          const domain = row.domain.trim().toLowerCase();
          const existing = aggregateByDomain.get(domain);
          if (existing) {
            existing.sitesCount++;
            existing.sourceDeviceIds.add(src.deviceId);
          } else {
            aggregateByDomain.set(domain, {
              daId: deriveAssetId(domain),
              domain,
              sourceDeviceIds: new Set([src.deviceId]),
              sitesCount: 1,
              firstSeenDeviceId: src.deviceId,
              bundesland: row.bundesland ?? null,
              gemeinde: row.gemeinde ?? null,
            });
          }
        }
      } finally {
        upstream.close();
      }
    }

    const aggregates = Array.from(aggregateByDomain.values()).sort((a, b) => a.daId.localeCompare(b.daId));
    const dedupedCount = totalRowsRead - aggregates.length;

    const merge = db.transaction(() => {
      db.prepare('DELETE FROM registry_alias').run();
      db.prepare('DELETE FROM business_registry').run();
      for (const item of aggregates) {
        insertRegistry.run(
          item.daId,
          item.domain,
          item.bundesland,
          item.gemeinde,
          state.sourceToken,
          item.firstSeenDeviceId,
          item.sitesCount,
        );
      }
    });
    merge();

    // Read back registry rows
    const registryRows = db.prepare(`
      SELECT da_id, domain, bundesland, gemeinde, first_seen_source_token, first_seen_device_id, sites_count
      FROM business_registry
      ORDER BY da_id
    `).all() as RegistryRow[];

    // Populate sites table inside registry_YYYY.db for downstream compatibility
    const insertSite = db.prepare(`
      INSERT INTO sites
        (domain, hwo_uid, hwo_confidence, hwo_provenance, bundesland, gemeinde, created_at)
      VALUES (?, NULL, NULL, NULL, ?, ?, unixepoch())
    `);

    const sitesTx = db.transaction(() => {
      db.prepare('DELETE FROM sites').run();
      for (const item of aggregates) {
        insertSite.run(
          item.domain,
          item.bundesland,
          item.gemeinde,
        );
      }
    });
    sitesTx();

    db.close();

    // Update state
    state.domainAggregates = aggregates;
    state.totalRowsRead = totalRowsRead;
    state.dedupedCount = dedupedCount;
    state.registryRows = registryRows;
    state.localDbPath = localDbPath;

    // Write artifacts
    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const nowIso = () => new Date().toISOString();

    const renderKeyValueMd = (title: string, values: Array<[string, string]>): string =>
      [
        `# ${title}`,
        ``,
        markdownTable([['Metric', 'Value'], ...values], { align: ['l', 'l'] }),
      ].join('\n');

    await writeJsonFile(
      path.join(outputDir, 'merge-registry.json'),
      {
        appId: '1-register-businesses',
        appVersion: APP_VERSION,
        deviceId: state.deviceId,
        sourceToken: state.sourceToken,
        registryDbPath: toFactoryRelativePath(localDbPath),
        upstreamCoreDbs: discovered.length,
        rawDistinctDomainsRead: totalRowsRead,
        uniqueDomainsWritten: aggregates.length,
        dedupedDomains: dedupedCount,
        perDeviceRows: perDeviceRows.map((row) => ({
          ...row,
          dbPath: toFactoryRelativePath(row.dbPath),
        })),
        completedAt: nowIso(),
      },
    );

    await writeTextFile(
      path.join(outputDir, 'merge-registry.md'),
      [
        renderKeyValueMd('Merge registry', [
          ['Registry DB', toFactoryRelativePath(localDbPath)],
          ['Upstream core DBs', String(discovered.length)],
          ['Raw distinct domains read', String(totalRowsRead)],
          ['Unique domains written', String(aggregates.length)],
          ['Deduped domains', String(dedupedCount)],
        ]),
        ``,
        `## Per-device input`,
        ``,
        markdownTable(
          [
            ['Device', 'Distinct domains', 'DB path'],
            ...perDeviceRows.map((row) => [row.deviceId, String(row.distinctDomains), toFactoryRelativePath(row.dbPath)]),
          ],
          { align: ['l', 'r', 'l'] },
        ),
      ].join('\n'),
    );
  }
}
