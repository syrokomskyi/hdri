/*
<MODULE_CONTRACT>
<purpose>Discovers upstream pages_*.db and core_*.db files matching the period across all factory devices.</purpose>
<non-goals>
  <item>Do not read or parse database contents.</item>
  <item>Do not modify upstream output directories.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add core DB discovery for asset state emit-bundle support.</item>
  <item>Fix filename pattern matching to support both pages_*.db and pages-*.db formats.</item>
  <item>Use strict quarter-only discovery for observation databases.</item>
  <item>Add AXE DB discovery for audit observation translation.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { listDeviceFolders } from "@syrokomskyi/observatory-crypto";
import { Gogol } from "../pipeline/Gogol.js";
import type {
  PipelineContext,
  DiscoveredAxeDb,
  DiscoveredCoreDb,
  DiscoveredLivenessDb,
  DiscoveredPagesDb,
} from "../pipeline/types.js";
import { upstreamOutputRoots } from "../config.js";

export class DiscoverSourcesGogol extends Gogol {
  override readonly id = "discover-sources";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const year = parsePeriod(brief.period).year;

    const discoveredPages: DiscoveredPagesDb[] = [];
    const coreDbs: DiscoveredCoreDb[] = [];
    const livenessDbs: DiscoveredLivenessDb[] = [];
    const axeDbs: DiscoveredAxeDb[] = [];

    // ── Discover pages_*.db (profile) ────────────────────────────────────────
    const profileDevices = await listDeviceFolders(upstreamOutputRoots.profile);
    for (const dev of profileDevices) {
      const dbDir = path.join(dev.path, "data", "db");
      let entries: string[];
      try {
        entries = await fsp.readdir(dbDir);
      } catch {
        continue;
      }

      for (const fname of entries) {
        if (fname !== `pages-${brief.period}.db`) continue;
        discoveredPages.push({
          deviceId: dev.deviceId,
          pagesDbPath: path.join(dbDir, fname),
        });
      }
    }

    // ── Discover liveness-YYYY-qN.db ────────────────────────────────────────
    const livenessDevices = await listDeviceFolders(upstreamOutputRoots.liveness);
    for (const dev of livenessDevices) {
      const livenessDbPath = path.join(dev.path, "data", "db", `liveness-${brief.period}.db`);
      if (fs.existsSync(livenessDbPath)) {
        livenessDbs.push({ deviceId: dev.deviceId, livenessDbPath });
      }
    }

    // ── Discover core_YYYY.db (harvest) ──────────────────────────────────────
    const harvestDevices = await listDeviceFolders(upstreamOutputRoots.harvest);
    for (const dev of harvestDevices) {
      const corePath = path.join(dev.path, "data", "db", `core_${year}.db`);
      if (fs.existsSync(corePath)) {
        coreDbs.push({ deviceId: dev.deviceId, coreDbPath: corePath });
      }
    }

    // ── Discover axe_YYYY.db (axe audit) ──────────────────────────────────────
    const axeDevices = await listDeviceFolders(upstreamOutputRoots.axe);
    for (const dev of axeDevices) {
      const axePath = path.join(dev.path, "data", "db", `axe-${brief.period}.db`);
      if (fs.existsSync(axePath)) {
        axeDbs.push({ deviceId: dev.deviceId, axeDbPath: axePath });
      }
    }

    // Persist discovery report as step artifact.
    await fsp.writeFile(
      path.join(ctx.outputDir, "discovered-sources.json"),
      JSON.stringify(
        {
          period: brief.period,
          pagesCount: discoveredPages.length,
          coreCount: coreDbs.length,
          livenessCount: livenessDbs.length,
          axeCount: axeDbs.length,
          sources: discoveredPages,
          coreDbs,
          livenessDbs,
          axeDbs,
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log(
      `[discover-sources] ${discoveredPages.length} pages DB(s), ${coreDbs.length} core DB(s), ${livenessDbs.length} liveness DB(s), ${axeDbs.length} axe DB(s) across ` +
        `${new Set(discoveredPages.map((d) => d.deviceId)).size} device(s) for period ${brief.period}`,
    );

    ctx.state.discoveredPages = discoveredPages;
    ctx.state.coreDbs = coreDbs;
    ctx.state.livenessDbs = livenessDbs;
    ctx.state.axeDbs = axeDbs;
  }
}
