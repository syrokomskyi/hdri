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
  <item>RFC-0115 B5: admit retained snapshot paths and authenticate selected results separately for every device.</item>
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
import { createHash } from "node:crypto";
import path from "node:path";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import {
  getTransparencyKeysDir,
  loadVerificationKeys,
  parseSourceSignatureManifest,
  verifySourceSignature,
  parseSourceToken,
} from "@syrokomskyi/observatory-crypto";
import {
  validateManifestSet,
  loadVerifiedQuarterExecution,
  copyVerifiedArtifact,
  capsuleConfigSha256,
  type QuarterCapsule,
  type CapsuleArtifact,
} from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type {
  PipelineContext,
  DiscoveredAxeDb,
  DiscoveredCoreDb,
  DiscoveredLivenessDb,
  DiscoveredPagesDb,
  VerifiedStageSnapshot,
} from "../pipeline/types.js";
import { upstreamOutputRoots, outputRootDir } from "../config.js";

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

    const verificationKeys = await loadVerificationKeys(getTransparencyKeysDir());

    const harvestSources = new Map<string, DiscoveredCoreDb>();
    for (const manifestPath of brief.coreManifestSet) {
      const sourceManifestPath = path.resolve(manifestPath);
      const manifestBytes = await fsp.readFile(sourceManifestPath, "utf8");
      const manifest = parseSourceSignatureManifest(manifestBytes);
      const key = verificationKeys.get(manifest.signing_key_id);
      const token = parseSourceToken(manifest.source_token);
      if (
        !key ||
        key.collectorId !== manifest.device_id ||
        !verifySourceSignature(manifest, key.publicKeyPem) ||
        manifest.app_id !== "0-harvest-source" ||
        `${token.year}-q${token.quarter}` !== brief.period ||
        harvestSources.has(manifest.device_id)
      ) {
        throw new Error(`Invalid or duplicate signed harvest snapshot: ${sourceManifestPath}`);
      }
      const sourceSnapshotPath = path.join(path.dirname(sourceManifestPath), manifest.snapshot.uri);
      const coreDbPath = path.join(
        outputRootDir,
        "admitted-inputs",
        manifest.snapshot.sha256,
        `core_${year}.db`,
      );
      await copyVerifiedArtifact(sourceSnapshotPath, coreDbPath, manifest.snapshot.sha256);
      if ((await fsp.stat(coreDbPath)).size !== manifest.snapshot.bytes)
        throw new Error("Harvest snapshot size mismatch");
      const sourceManifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
      if ((await fsp.readFile(sourceManifestPath, "utf8")) !== manifestBytes)
        throw new Error("Harvest signature changed during admission");
      harvestSources.set(manifest.device_id, {
        deviceId: manifest.device_id,
        coreDbPath,
        sourceSnapshotPath,
        sourceManifestPath,
        sourceManifestSha256,
        snapshotSha256: manifest.snapshot.sha256,
        sourceLedgerRoot: path.join(
          upstreamOutputRoots.harvest,
          manifest.device_id,
          "data",
          "source-ledger",
        ),
      });
    }

    const discoveredPages: DiscoveredPagesDb[] = [];
    const coreDbs: DiscoveredCoreDb[] = [];
    const livenessDbs: DiscoveredLivenessDb[] = [];
    const axeDbs: DiscoveredAxeDb[] = [];
    const verifiedSnapshots: VerifiedStageSnapshot[] = [];

    const devices = new Set<string>();
    for (const manifestPath of brief.inputManifestSet) {
      // Device-local verification prevents one device's stage map overwriting another.
      const manifestBytes = await fsp.readFile(manifestPath, "utf8");
      const verified = await validateManifestSet(
        [manifestPath],
        verificationKeys,
        brief.period,
        brief.capsuleId,
      );
      const capsule = JSON.parse(manifestBytes) as QuarterCapsule;
      const deviceId = capsule.deviceId!;
      if (!verified.deviceIds.includes(deviceId) || devices.has(deviceId)) {
        throw new Error(`Duplicate or substituted device manifest: ${deviceId}`);
      }
      devices.add(deviceId);
      const capsuleDir = path.dirname(path.resolve(manifestPath));
      const required = capsule.instrumentPlan
        .filter((e) => e.state === "required")
        .map((e) => e.instrument);
      const execution = await loadVerifiedQuarterExecution(capsuleDir, required, verificationKeys);
      if (
        execution.capsuleConfigSha256 !==
          capsuleConfigSha256(brief.period, brief.capsuleId, capsule.instrumentPlan) ||
        execution.capsuleConfigSha256 !==
          capsuleConfigSha256(brief.period, brief.capsuleId, brief.instrumentPlan)
      ) {
        throw new Error(
          `Authenticated execution configuration differs from manifest or brief: ${deviceId}`,
        );
      }
      for (const stage of execution.stages) {
        if (
          stage.collectorId !== deviceId ||
          stage.results.some(
            (r) => r.key.period !== brief.period || r.key.capsuleId !== brief.capsuleId,
          )
        ) {
          throw new Error(`Execution scope differs from manifest: ${deviceId}/${stage.stageId}`);
        }
      }
      if ((await fsp.readFile(manifestPath, "utf8")) !== manifestBytes)
        throw new Error("Manifest changed during source admission");
      const snapshot = (
        stage: CapsuleArtifact["stage"],
        filename: string,
        sourceOutputRoot: string,
      ) => {
        const entries = capsule.artifacts.filter(
          (a) => a.stage === stage && a.uri === `artifacts/${stage}/${deviceId}/${filename}`,
        );
        if (entries.length !== 1)
          throw new Error(`Expected one retained ${stage} snapshot for ${deviceId}`);
        const artifact = entries[0]!;
        return {
          deviceId,
          capsuleDir,
          artifact,
          execution,
          sourceOutputRoot: path.join(sourceOutputRoot, deviceId),
        };
      };
      if (required.includes("profile")) {
        const src = snapshot("profile", `pages-${brief.period}.db`, upstreamOutputRoots.profile);
        discoveredPages.push({ ...src, pagesDbPath: path.resolve(capsuleDir, src.artifact.uri) });
      }

      const core = harvestSources.get(deviceId);
      if (!core) throw new Error(`coreManifestSet lacks a signed harvest snapshot for ${deviceId}`);
      coreDbs.push(core);

      if (required.includes("liveness")) {
        const src = snapshot(
          "liveness",
          `liveness-${brief.period}.db`,
          upstreamOutputRoots.liveness,
        );
        livenessDbs.push({ ...src, livenessDbPath: path.resolve(capsuleDir, src.artifact.uri) });
      }
      if (required.includes("axe")) {
        const src = snapshot("axe", `axe-${brief.period}.db`, upstreamOutputRoots.axe);
        axeDbs.push({ ...src, axeDbPath: path.resolve(capsuleDir, src.artifact.uri) });
      }

      for (const [stageId, sealSha256] of verified.stageSeals) {
        const selection = execution.stages.find((s) => s.stageId === stageId);
        if (!selection)
          throw new Error(`Stage snapshot lacks authenticated selection: ${deviceId}/${stageId}`);
        const refs = verified.artifactRefs.get(stageId) ?? [];
        verifiedSnapshots.push({
          schema: "hdri-stage-snapshot@1",
          period: brief.period,
          capsuleId: brief.capsuleId,
          deviceId,
          stageId,
          stageSealSha256: sealSha256,
          targetSetSha256: selection.targetSetSha256,
          selectedResultSetSha256: selection.selectedResultSetSha256,
          projectionSha256:
            capsule.artifacts.find((a) => refs.includes(a.uri) && /\.(db|sqlite)$/.test(a.uri))
              ?.sha256 ?? "",
          artifactRefs: [...refs],
        });
      }
    }
    if (harvestSources.size !== devices.size)
      throw new Error("Harvest manifests include unadmitted devices");

    await fsp.writeFile(
      path.join(ctx.outputDir, "discovered-sources.json"),
      JSON.stringify(
        {
          period: brief.period,
          manifestSet: brief.inputManifestSet,
          verifiedDevices: [...devices],
          pagesCount: discoveredPages.length,
          coreCount: coreDbs.length,
          livenessCount: livenessDbs.length,
          axeCount: axeDbs.length,
          sources: discoveredPages.map(({ execution: _execution, ...source }) => source),
          coreDbs,
          livenessDbs: livenessDbs.map(({ execution: _execution, ...source }) => source),
          axeDbs: axeDbs.map(({ execution: _execution, ...source }) => source),
          verifiedSnapshots,
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log(
      `[discover-sources] ${discoveredPages.length} pages DB(s), ${coreDbs.length} core DB(s), ${livenessDbs.length} liveness DB(s), ${axeDbs.length} axe DB(s) across ` +
        `${devices.size} verified device(s) for period ${brief.period}`,
    );

    ctx.state.discoveredPages = discoveredPages;
    ctx.state.coreDbs = coreDbs;
    ctx.state.livenessDbs = livenessDbs;
    ctx.state.axeDbs = axeDbs;
    ctx.state.verifiedSnapshots = verifiedSnapshots;
  }
}
