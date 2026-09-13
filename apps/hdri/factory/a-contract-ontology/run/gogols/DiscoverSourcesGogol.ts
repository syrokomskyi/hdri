/*
<MODULE_CONTRACT>
<purpose>Admits upstream source databases through verified manifest sets, replacing unverified filesystem discovery.</purpose>
<non-goals>
  <item>Do not read or parse database contents.</item>
  <item>Do not modify upstream output directories.</item>
  <item>Do not scan device folders by filename — admission is manifest-based only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add core DB discovery for asset state emit-bundle support.</item>
  <item>Fix filename pattern matching to support both pages_*.db and pages-*.db formats.</item>
  <item>Use strict quarter-only discovery for observation databases.</item>
  <item>Add AXE DB discovery for audit observation translation.</item>
  <item>RFC-0106: replace filesystem scanning with validateManifestSet verified source admission.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fsp from "node:fs/promises";
import path from "node:path";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { validateManifestSet } from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type {
  PipelineContext,
  DiscoveredAxeDb,
  DiscoveredCoreDb,
  DiscoveredLivenessDb,
  DiscoveredPagesDb,
  VerifiedStageSnapshot,
} from "../pipeline/types.js";
import { upstreamOutputRoots } from "../config.js";

export class DiscoverSourcesGogol extends Gogol {
  override readonly id = "discover-sources";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const year = parsePeriod(brief.period).year;

    if (brief.inputManifestSet.length === 0) {
      throw new Error(
        "RFC-0106: brief.md must declare inputManifestSet — unverified filesystem discovery is no longer supported",
      );
    }

    const verificationKeys = await loadVerificationKeys(
      path.join(upstreamOutputRoots.harvest, "..", "..", "transparency", "keys"),
    );

    const verified = await validateManifestSet(
      brief.inputManifestSet,
      verificationKeys,
      brief.period,
      brief.capsuleId,
    );

    const discoveredPages: DiscoveredPagesDb[] = [];
    const coreDbs: DiscoveredCoreDb[] = [];
    const livenessDbs: DiscoveredLivenessDb[] = [];
    const axeDbs: DiscoveredAxeDb[] = [];
    const verifiedSnapshots: VerifiedStageSnapshot[] = [];

    for (const deviceId of verified.deviceIds) {
      const deviceOutputRoot = path.join(upstreamOutputRoots.profile, deviceId);
      const dbDir = path.join(deviceOutputRoot, "data", "db");

      const pagesDbPath = path.join(dbDir, `pages-${brief.period}.db`);
      discoveredPages.push({ deviceId, pagesDbPath });

      const coreDbPath = path.join(
        upstreamOutputRoots.harvest,
        deviceId,
        "data",
        "db",
        `core_${year}.db`,
      );
      coreDbs.push({ deviceId, coreDbPath });

      const livenessDbPath = path.join(
        upstreamOutputRoots.liveness,
        deviceId,
        "data",
        "db",
        `liveness-${brief.period}.db`,
      );
      livenessDbs.push({ deviceId, livenessDbPath });

      const axeDbPath = path.join(
        upstreamOutputRoots.axe,
        deviceId,
        "data",
        "db",
        `axe-${brief.period}.db`,
      );
      axeDbs.push({ deviceId, axeDbPath });

      for (const [stageId, sealSha256] of verified.stageSeals) {
        const targetSha256 = verified.targetSetSha256.get(stageId) ?? "";
        const selectedResultSha = verified.selectedResultSetSha256.get(stageId) ?? "";
        const refs = verified.artifactRefs.get(stageId) ?? [];
        verifiedSnapshots.push({
          schema: "hdri-stage-snapshot@1",
          period: brief.period,
          capsuleId: brief.capsuleId,
          deviceId,
          stageId,
          stageSealSha256: sealSha256,
          targetSetSha256: targetSha256,
          selectedResultSetSha256: selectedResultSha,
          projectionSha256: selectedResultSha,
          artifactRefs: [...refs],
        });
      }
    }

    await fsp.writeFile(
      path.join(ctx.outputDir, "discovered-sources.json"),
      JSON.stringify(
        {
          period: brief.period,
          manifestSet: brief.inputManifestSet,
          verifiedDevices: verified.deviceIds,
          pagesCount: discoveredPages.length,
          coreCount: coreDbs.length,
          livenessCount: livenessDbs.length,
          axeCount: axeDbs.length,
          sources: discoveredPages,
          coreDbs,
          livenessDbs,
          axeDbs,
          verifiedSnapshots,
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log(
      `[discover-sources] ${discoveredPages.length} pages DB(s), ${coreDbs.length} core DB(s), ${livenessDbs.length} liveness DB(s), ${axeDbs.length} axe DB(s) across ` +
        `${verified.deviceIds.length} verified device(s) for period ${brief.period}`,
    );

    ctx.state.discoveredPages = discoveredPages;
    ctx.state.coreDbs = coreDbs;
    ctx.state.livenessDbs = livenessDbs;
    ctx.state.axeDbs = axeDbs;
    ctx.state.verifiedSnapshots = verifiedSnapshots;
  }
}
