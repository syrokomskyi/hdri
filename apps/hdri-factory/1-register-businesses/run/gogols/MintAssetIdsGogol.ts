/*
<MODULE_CONTRACT>
<purpose>Generates summary of minted deterministic asset IDs.</purpose>
<keywords>asset-ids, mint, summary, deterministic</keywords>
<responsibilities>
  <item>Reads the business_registry table from local registry DB.</item>
  <item>Generates asset-id-summary.json with sample rows.</item>
  <item>Writes asset-ids.ndjson with all rows.</item>
  <item>Creates human-readable asset-id-summary.md.</item>
</responsibilities>
<non-goals>
  <item>Do not mint new IDs (they are already minted in MergeRegistryGogol).</item>
  <item>Do not sign the registry content (handled by SignSourceGogol).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="MintAssetIdsGogol">Summarizes minted asset IDs from registry.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation extracted from monolithic main.ts.</item>
  <item>Normalise localDbPath to relative in asset-id-summary.md artifact using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
  <item>Add inline note explaining Sites count metric in generated asset-id-summary.md.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { toFactoryRelativePath } from '../config.js';
import { ensureOutputDir, writeJsonFile, writeTextFile } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

const APP_VERSION = '0.1.0';

export class MintAssetIdsGogol extends Gogol {
  override readonly id = 'mint-asset-ids';

  override readonly guide = {
    title: 'Mint asset IDs',
    purpose: 'Generate summary artifacts for all deterministic da-* asset IDs assigned to registered domains.',
    decisionType: 'auto' as const,
    inputs: ['registry_YYYY.db business_registry table'],
    outputs: [
      'asset-id-summary.json',
      'asset-ids.ndjson',
      'asset-id-summary.md',
    ],
    definitionOfDone: [
      'asset-id-summary.json written with sample rows',
      'asset-ids.ndjson written with all rows',
      'asset-id-summary.md written with human-readable table',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const registryRows = state.registryRows;

    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const nowIso = () => new Date().toISOString();

    const assetIdRows = registryRows.map((row) => ({
      daId: row.da_id,
      domain: row.domain,
      sourceDeviceId: row.first_seen_device_id,
      sitesCount: row.sites_count,
    }));

    const renderKeyValueMd = (title: string, values: Array<[string, string]>): string =>
      [
        `# ${title}`,
        ``,
        markdownTable([['Metric', 'Value'], ...values], { align: ['l', 'l'] }),
      ].join('\n');

    await writeJsonFile(
      path.join(outputDir, 'asset-id-summary.json'),
      {
        appId: '1-register-businesses',
        appVersion: APP_VERSION,
        deviceId: state.deviceId,
        sourceToken: state.sourceToken,
        assetIdsMinted: assetIdRows.length,
        deterministicRule: 'deriveAssetId(domain) from @org/observatory-core',
        sample: assetIdRows.slice(0, 20),
        completedAt: nowIso(),
      },
    );

    await writeTextFile(
      path.join(outputDir, 'asset-ids.ndjson'),
      assetIdRows.map((row) => JSON.stringify(row)).join('\n'),
    );

    await writeTextFile(
      path.join(outputDir, 'asset-id-summary.md'),
      [
        renderKeyValueMd('Mint asset IDs', [
          ['Deterministic rule', '`deriveAssetId(domain)` from `@org/observatory-core`'],
          ['Asset IDs minted', String(assetIdRows.length)],
          ['Registry DB', toFactoryRelativePath(state.localDbPath)],
        ]),
        ``,
        `## Sample`,
        ``,
        `> **Sites count** - number of upstream core DBs (devices) that contributed this domain after cross-source deduplication.`,
        ``,
        markdownTable(
          [
            ['da_id', 'Domain', 'Sites count'],
            ...assetIdRows.slice(0, 20).map((row) => [row.daId, row.domain, String(row.sitesCount)]),
          ],
          { align: ['l', 'l', 'r'] },
        ),
      ].join('\n'),
    );
  }
}
