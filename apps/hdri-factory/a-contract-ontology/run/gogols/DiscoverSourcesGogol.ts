/*
<MODULE_CONTRACT>
<purpose>Discovers upstream pages_*.db and core_*.db files matching the period across all factory devices.</purpose>
<keywords>discovery, pages_db, core_db, upstream, devices, asset states</keywords>
<responsibilities>
  <item>Walks every device folder in the profile output root.</item>
  <item>Finds pages_*.db files matching the brief period.</item>
  <item>Locates matching registry_YYYY.db on the same device.</item>
  <item>Walks every device folder in the harvest output root.</item>
  <item>Finds core_YYYY.db files matching the brief period year.</item>
  <item>Writes discovered-sources.json artifact.</item>
  <item>Stores discovered sources in pipeline state.</item>
</responsibilities>
<non-goals>
  <item>Do not read or parse database contents.</item>
  <item>Do not modify upstream output directories.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="DiscoverSourcesGogol">Gogol that discovers upstream pages_*.db and core_*.db files.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add core DB discovery for asset state emit-bundle support.</item>
  <item>Fix filename pattern matching to support both pages_*.db and pages-*.db formats.</item>
  <item>Add support for simple period patterns like "2026-h1" alongside full sourceToken format.</item>
  <item>Add AXE DB discovery for audit observation translation.</item>
</CHANGE_SUMMARY>
*/

import '@org/observatory-crypto/auto-env';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parsePeriod } from '@org/observatory-core';
import {
  listDeviceFolders,
  parseSourceToken,
  periodMatchesToken,
} from '@org/observatory-crypto';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext, DiscoveredAxeDb, DiscoveredCoreDb, DiscoveredPagesDb } from '../pipeline/types.js';
import { upstreamOutputRoots } from '../config.js';

export class DiscoverSourcesGogol extends Gogol {
  override readonly id = 'discover-sources';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const year = parsePeriod(brief.period).year;

    const discoveredPages: DiscoveredPagesDb[] = [];
    const coreDbs: DiscoveredCoreDb[] = [];
    const axeDbs: DiscoveredAxeDb[] = [];

    // ── Discover pages_*.db (profile) ────────────────────────────────────────
    const profileDevices = await listDeviceFolders(upstreamOutputRoots.profile);
    for (const dev of profileDevices) {
      const dbDir = path.join(dev.path, 'data', 'db');
      let entries: string[];
      try { entries = await fsp.readdir(dbDir); } catch { continue; }

      for (const fname of entries) {
        // Support both pages_*.db and pages-*.db formats
        if (!fname.startsWith('pages_') && !fname.startsWith('pages-')) continue;
        if (!fname.endsWith('.db')) continue;
        
        // Extract token after "pages_" or "pages-"
        const sourceToken = fname.startsWith('pages_') 
          ? fname.slice('pages_'.length, -'.db'.length)
          : fname.slice('pages-'.length, -'.db'.length);
        
        let parsedToken: { year: number; quarter: number };
        let isSimplePattern = false;
        
        try {
          parsedToken = parseSourceToken(sourceToken);
        } catch { 
          // If parseSourceToken fails, try to match simple patterns like "2026-h1"
          const simpleMatch = /^(\d{4})-(h[12]|q[1-4])$/.exec(sourceToken);
          if (!simpleMatch) continue;
          const year = parseInt(simpleMatch[1], 10);
          const period = simpleMatch[2];
          // Convert h1/h2 to quarters: h1 covers Q1+Q2, h2 covers Q3+Q4
          // For current quarter matching, h1 should match both Q1 and Q2
          const quarter = period === 'h1' ? 2 : period === 'h2' ? 4 : parseInt(period.slice(1), 10);
          parsedToken = { year, quarter };
          isSimplePattern = true;
        }
        
        // Check period matching
        if (isSimplePattern) {
          // For simple patterns like "2026-h1", check if the period matches
          const briefYear = parsePeriod(brief.period).year;
          const briefQuarter = parsePeriod(brief.period).quarter;
          if (parsedToken.year !== briefYear) continue;
          
          // h1 covers Q1+Q2, h2 covers Q3+Q4
          const sourceToken = fname.startsWith('pages_') 
            ? fname.slice('pages_'.length, -'.db'.length)
            : fname.slice('pages-'.length, -'.db'.length);
          
          const simpleMatch = /^(\d{4})-(h[12]|q[1-4])$/.exec(sourceToken);
          if (simpleMatch) {
            const period = simpleMatch[2];
            if (period === 'h1' && (briefQuarter !== 1 && briefQuarter !== 2)) continue;
            if (period === 'h2' && (briefQuarter !== 3 && briefQuarter !== 4)) continue;
            if (period.startsWith('q') && parseInt(period.slice(1), 10) !== briefQuarter) continue;
          }
        } else {
          // For full sourceToken format, use periodMatchesToken
          if (!periodMatchesToken(brief.period, sourceToken)) continue;
        }

        const registryDbPath = path.join(
          upstreamOutputRoots.registry, dev.deviceId, 'data', 'db', `registry_${parsedToken.year}.db`,
        );
        if (!fs.existsSync(registryDbPath)) {
          console.warn(`[discover-sources] ${dev.deviceId}/${fname}: missing matching registry_${parsedToken.year}.db — skipped`);
          continue;
        }
        discoveredPages.push({
          deviceId: dev.deviceId,
          sourceToken,
          pagesDbPath: path.join(dbDir, fname),
          registryDbPath,
        });
      }
    }

    // ── Discover core_YYYY.db (harvest) ──────────────────────────────────────
    const harvestDevices = await listDeviceFolders(upstreamOutputRoots.harvest);
    for (const dev of harvestDevices) {
      const corePath = path.join(dev.path, 'data', 'db', `core_${year}.db`);
      if (fs.existsSync(corePath)) {
        coreDbs.push({ deviceId: dev.deviceId, coreDbPath: corePath });
      }
    }

    // ── Discover axe_YYYY.db (axe audit) ──────────────────────────────────────
    const axeDevices = await listDeviceFolders(upstreamOutputRoots.axe);
    for (const dev of axeDevices) {
      const axePath = path.join(dev.path, 'data', 'db', `axe_${year}.db`);
      const registryDbPath = path.join(
        upstreamOutputRoots.registry,
        dev.deviceId,
        'data',
        'db',
        `registry_${year}.db`,
      );
      if (fs.existsSync(axePath)) {
        if (!fs.existsSync(registryDbPath)) {
          console.warn(`[discover-sources] ${dev.deviceId}/axe_${year}.db: missing matching registry_${year}.db — skipped`);
          continue;
        }
        axeDbs.push({ deviceId: dev.deviceId, axeDbPath: axePath, registryDbPath });
      }
    }

    // Persist discovery report as step artifact.
    await fsp.writeFile(
      path.join(ctx.outputDir, 'discovered-sources.json'),
      JSON.stringify({
        period: brief.period,
        pagesCount: discoveredPages.length,
        coreCount: coreDbs.length,
        axeCount: axeDbs.length,
        sources: discoveredPages,
        coreDbs,
        axeDbs,
      }, null, 2),
      'utf-8',
    );

    console.log(
      `[discover-sources] ${discoveredPages.length} pages_*.db, ${coreDbs.length} core_*.db, ${axeDbs.length} axe_*.db across ` +
      `${new Set(discoveredPages.map((d) => d.deviceId)).size} device(s) for period ${brief.period}`,
    );

    ctx.state.discoveredPages = discoveredPages;
    ctx.state.coreDbs = coreDbs;
    ctx.state.axeDbs = axeDbs;
  }
}
