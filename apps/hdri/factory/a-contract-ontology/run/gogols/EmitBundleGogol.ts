/*
<MODULE_CONTRACT>
<purpose>Emits the canonical observation and asset-state bundle using EmitBundleWriter — this module handles emit bundle operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not sign observations — that is done by SignBundleGogol.</item>
  <item>Do not modify upstream databases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Add asset state harvesting from core_*.db for emit-bundle schema v2.</item>
  <item>Add gewerk_group in emitted asset states by deriving it from site_hwo_mappings with mapping_system = destatis_group.</item>
  <item>Write immutable emit bundles to .output/emit/&lt;period&gt;/&lt;factory_run_id&gt;/ and persist emit_dir in pipeline state.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: emit-bundle contract is immutable; never change manifest schema without version bump

import "@syrokomskyi/observatory-crypto/auto-env";
import Database from "better-sqlite3";
import fsp from "node:fs/promises";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { deriveAssetId } from "@syrokomskyi/observatory-core";
import type { AssetStateMapping, AssetStateRecord } from "@syrokomskyi/observatory-core";
import { EmitBundleWriter } from "@syrokomskyi/observatory-emit";
import type { SignedObservation } from "@syrokomskyi/observatory-crypto";
import {
  sealQuarterCapsule,
  type CapsuleArtifact,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { outputRootDir } from "../config.js";

const APP_VERSION = "0.1.0";
const APP_ID = "a-contract-ontology";
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
  override readonly id = "emit-bundle";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, signedNdjsonPath, coreDbs, discoveredPages, livenessDbs, axeDbs, ontology } = ctx.state;
    if (!signedNdjsonPath) throw new Error("No signed observation stream — run sign-bundle first");

    const factoryRunId = brief.capsuleId;
    const capsuleDir = path.join(outputRootDir, "capsules", brief.period, brief.capsuleId);
    const emitDir = path.join(capsuleDir, "artifacts", "emit");
    try {
      await fsp.access(path.join(capsuleDir, "capsule-manifest.json"));
      throw new Error(`Quarter capsule is already sealed: ${brief.period}/${brief.capsuleId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fsp.mkdir(path.dirname(emitDir), { recursive: true });

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
    const lines = readline.createInterface({
      input: fs.createReadStream(signedNdjsonPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (line.trim() !== "") writer.writeObservation(JSON.parse(line) as SignedObservation);
    }

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
      console.log(
        `[emit-bundle] Harvested ${assetStateCount} asset state(s) from ${coreDbs.length} core DB(s)`,
      );
    }

    const manifest = await writer.commit();
    const manifestWithDir = {
      ...manifest,
      emit_dir: emitDir,
    };

    // Write manifest as step artifact.
    await fsp.writeFile(
      path.join(ctx.outputDir, "manifest.json"),
      JSON.stringify(manifestWithDir, null, 2),
      "utf-8",
    );

    const bundleHash = manifest.bundle_hash ?? "";
    console.log(
      `[emit-bundle] Wrote ${manifest.observation_count} observations, ${manifest.asset_state_count ?? 0} asset states to ${emitDir}\n` +
        `[emit-bundle] bundle_hash=${bundleHash.slice(0, 16)}…`,
    );

    const artifacts: CapsuleArtifact[] = [];
    const retainDb = async (
      stage: "liveness" | "profile" | "axe",
      deviceId: string,
      source: string,
    ): Promise<void> => {
      const uri = `artifacts/${stage}/${deviceId}/${path.basename(source)}`;
      const destination = path.join(capsuleDir, uri);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(source, destination);
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256: await hashFile(destination), bytes: stat.size });
    };
    for (const item of livenessDbs) await retainDb("liveness", item.deviceId, item.livenessDbPath);
    for (const item of discoveredPages) await retainDb("profile", item.deviceId, item.pagesDbPath);
    for (const item of axeDbs) await retainDb("axe", item.deviceId, item.axeDbPath);

    for (const item of coreDbs) {
      const frameSource = path.resolve(
        path.dirname(item.coreDbPath),
        "..",
        "source-ledger",
        "projections",
        `frame-${brief.period}.json`,
      );
      try {
        const frameUri = "artifacts/frame/frame.json";
        const frameDestination = path.join(capsuleDir, frameUri);
        await fsp.mkdir(path.dirname(frameDestination), { recursive: true });
        await fsp.copyFile(frameSource, frameDestination);
        const stat = await fsp.stat(frameDestination);
        artifacts.push({ stage: "frame", uri: frameUri, sha256: await hashFile(frameDestination), bytes: stat.size });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (!artifacts.some((artifact) => artifact.stage === "frame")) {
      throw new Error(`No frozen source frame found for ${brief.period}`);
    }

    const emitManifestPath = path.join(emitDir, "manifest.json");
    const emitStat = await fsp.stat(emitManifestPath);
    artifacts.push({
      stage: "emit",
      uri: "artifacts/emit/manifest.json",
      sha256: await hashFile(emitManifestPath),
      bytes: emitStat.size,
    });
    if (ontology) {
      const methodologyUri = "artifacts/methodology/ontology.json";
      const methodologyPath = path.join(capsuleDir, methodologyUri);
      await fsp.mkdir(path.dirname(methodologyPath), { recursive: true });
      await fsp.writeFile(methodologyPath, `${JSON.stringify(ontology, null, 2)}\n`, "utf8");
      const stat = await fsp.stat(methodologyPath);
      artifacts.push({ stage: "methodology", uri: methodologyUri, sha256: await hashFile(methodologyPath), bytes: stat.size });
    }

    const capsule: QuarterCapsule = {
      period: brief.period,
      capsuleId: brief.capsuleId,
      state: "sealed",
      instrumentPlan: [
        { instrument: "liveness", state: "required", reason: null },
        { instrument: "profile", state: "required", reason: null },
        { instrument: "axe", state: "required", reason: null },
        { instrument: "lighthouse", state: "disabled", reason: "Q3 2026 instrument plan" },
      ],
      artifacts,
    };
    await sealQuarterCapsule(capsuleDir, capsule);
    ctx.state.manifest = manifestWithDir;
  }
}

const hashFile = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });

// ── Standalone helpers tested independently ───────────────────────────────────

export function readAssetStates(coreDbPath: string): {
  records: AssetStateRecord[];
} {
  const db = new Database(coreDbPath, { readonly: true });

  let sites: CoreSite[];
  let mappings: CoreMapping[];
  let industryGroups: SiteIndustryGroup[];
  try {
    sites = db
      .prepare(
        `SELECT id, domain, hwo_uid, hwo_provenance, bundesland, gemeinde FROM sites ORDER BY id`,
      )
      .all() as CoreSite[];

    mappings = db
      .prepare(
        `SELECT site_id, mapping_system, target_code, target_label, source FROM site_hwo_mappings`,
      )
      .all() as CoreMapping[];

    industryGroups = db
      .prepare(
        `SELECT site_id, target_code AS gewerk_group
       FROM site_hwo_mappings
       WHERE mapping_system = 'destatis_group'`,
      )
      .all() as SiteIndustryGroup[];
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
