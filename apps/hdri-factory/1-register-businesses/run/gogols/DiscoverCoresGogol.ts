/*
<MODULE_CONTRACT>
<purpose>Discovers upstream core_YYYY.db files from all devices in 0-harvest-source output.</purpose>
<keywords>discovery, upstream, core.db, scan</keywords>
<responsibilities>
  <item>Scans all device folders in upstream 0-harvest-source output.</item>
  <item>Locates core_YYYY.db files for the current year.</item>
  <item>Writes discovered cores metadata to JSON and Markdown artifacts.</item>
  <item>Updates pipeline state with discovered cores.</item>
</responsibilities>
<non-goals>
  <item>Do not read or modify the core.db contents.</item>
  <item>Do not create the local registry database.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="DiscoverCoresGogol">Discovers upstream core DBs across all devices.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation extracted from monolithic main.ts.</item>
  <item>Normalise upstreamHarvestOutputRoot and per-device dbPath to relative in discovered-cores.json and discovered-cores.md artifacts using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
  <item>Read upstreamHarvestOutputRoot from pipeline state instead of importing from config.ts, so the upstream phase is driven by brief.coreDbPath rather than a hardcoded string.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs';
import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { listDeviceFolders } from '@org/observatory-crypto';
import { ensureOutputDir, writeJsonFile, writeTextFile } from '@org/pipeline-node/fs';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { toFactoryRelativePath } from '../config.js';

const APP_VERSION = '0.1.0';

export class DiscoverCoresGogol extends Gogol {
  override readonly id = 'discover-cores';

  override readonly guide = {
    title: 'Discover upstream core DBs',
    purpose: 'Scan sibling 0-harvest-source output directories to locate core_YYYY.db files across all devices.',
    decisionType: 'auto' as const,
    inputs: ['0-harvest-source/.output/<deviceId>/data/db/core_YYYY.db'],
    outputs: ['discovered-cores.json', 'discovered-cores.md'],
    definitionOfDone: [
      'At least one core_YYYY.db file discovered',
      'discovered-cores.json written with device metadata',
      'discovered-cores.md written with human-readable table',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const year = state.year;
    const coreDbName = `core_${year}.db`;

    const { upstreamHarvestOutputRoot } = state;
    const devices = await listDeviceFolders(upstreamHarvestOutputRoot);
    const discovered: Array<{ deviceId: string; dbPath: string; sizeBytes: number }> = [];

    for (const dev of devices) {
      const candidate = path.join(dev.path, 'data', 'db', coreDbName);
      if (fs.existsSync(candidate)) {
        discovered.push({
          deviceId: dev.deviceId,
          dbPath: candidate,
          sizeBytes: fs.statSync(candidate).size,
        });
      }
    }

    const outputDir = ctx.getGogolOutputDir(this.id);
    await ensureOutputDir(outputDir);

    const nowIso = () => new Date().toISOString();

    await writeJsonFile(
      path.join(outputDir, 'discovered-cores.json'),
      {
        appId: '1-register-businesses',
        appVersion: APP_VERSION,
        deviceId: state.deviceId,
        sourceToken: state.sourceToken,
        year,
        upstreamHarvestOutputRoot: toFactoryRelativePath(upstreamHarvestOutputRoot),
        coreDbName,
        discoveredAt: nowIso(),
        coreDbs: discovered.map((d) => ({
          ...d,
          dbPath: toFactoryRelativePath(d.dbPath),
        })),
      },
    );

    await writeTextFile(
      path.join(outputDir, 'discovered-cores.md'),
      [
        `# Discover upstream core DBs`,
        ``,
        `This step scans sibling \`0-harvest-source/.output/<deviceId>/data/db/\` folders and selects \`${coreDbName}\`.`,
        ``,
        markdownTable(
          [
            ['Device', 'DB path', 'Size bytes'],
            ...discovered.map((d) => [d.deviceId, toFactoryRelativePath(d.dbPath), String(d.sizeBytes)]),
          ],
          { align: ['l', 'l', 'r'] },
        ),
      ].join('\n'),
    );

    if (discovered.length === 0) {
      throw new Error(
        `No core_${year}.db found under ${upstreamHarvestOutputRoot}/<device>/data/db/.\n` +
        `Run 0-harvest-source first (on at least one device with this sourceToken).`,
      );
    }

    // Update state
    state.discoveredCores = discovered;
  }
}
