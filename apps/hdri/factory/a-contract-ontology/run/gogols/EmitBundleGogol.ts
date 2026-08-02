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
  writeQuarterCapsuleStaging,
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
      for (const rec of iterateAssetStates(coreDb.coreDbPath)) {
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

    const retainCasFile = async (
      stage: "profile" | "axe",
      deviceId: string,
      source: string,
      relativeStoragePath: string,
      expectedSha256: string,
    ): Promise<void> => {
      const uri = `artifacts/${stage}/${deviceId}/${relativeStoragePath.replaceAll(path.sep, "/")}`;
      const destination = path.join(capsuleDir, uri);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      try {
        await fsp.link(source, destination);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
          // Idempotent retry: the closure check below proves the existing bytes.
        } else if (code === "EXDEV" || code === "EPERM" || code === "ENOTSUP") {
          await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL).catch((copyError) => {
            if ((copyError as NodeJS.ErrnoException).code !== "EEXIST") throw copyError;
          });
        } else {
          throw error;
        }
      }
      const sha256 = await hashFile(destination);
      if (sha256 !== expectedSha256) throw new Error(`CAS closure hash mismatch: ${relativeStoragePath}`);
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256, bytes: stat.size });
    };

    for (const item of discoveredPages) {
      const db = new Database(item.pagesDbPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db.prepare("SELECT content_hash AS contentHash, storage_path AS storagePath FROM page_contents ORDER BY content_hash").all() as Array<{ contentHash: string; storagePath: string }>;
        const outputRoot = path.dirname(path.dirname(path.dirname(item.pagesDbPath)));
        for (const row of rows) {
          if (row.storagePath !== `data/content/${row.contentHash.slice(0, 2)}/${row.contentHash}.html`) {
            throw new Error(`Non-canonical profile CAS path: ${row.storagePath}`);
          }
          await retainCasFile("profile", item.deviceId, path.resolve(outputRoot, row.storagePath), row.storagePath, row.contentHash);
        }
      } finally {
        db.close();
      }
    }

    for (const item of axeDbs) {
      const db = new Database(item.axeDbPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db.prepare("SELECT DISTINCT report_sha256 AS reportSha256 FROM axe_runs WHERE report_sha256 IS NOT NULL ORDER BY report_sha256").all() as Array<{ reportSha256: string }>;
        const outputRoot = path.dirname(path.dirname(path.dirname(item.axeDbPath)));
        for (const row of rows) {
          const relative = `data/audit-reports/axe/${row.reportSha256.slice(0, 2)}/${row.reportSha256}.json`;
          await retainCasFile("axe", item.deviceId, path.resolve(outputRoot, relative), relative, row.reportSha256);
        }
      } finally {
        db.close();
      }
    }

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

    for (const name of ["manifest.json", "observations.ndjson", "asset-states.ndjson"]) {
      const emitPath = path.join(emitDir, name);
      const emitStat = await fsp.stat(emitPath);
      artifacts.push({
        stage: "emit",
        uri: `artifacts/emit/${name}`,
        sha256: await hashFile(emitPath),
        bytes: emitStat.size,
      });
    }
    if (ontology) {
      const methodologyUri = "artifacts/methodology/ontology.json";
      const methodologyPath = path.join(capsuleDir, methodologyUri);
      await fsp.mkdir(path.dirname(methodologyPath), { recursive: true });
      await fsp.writeFile(methodologyPath, `${JSON.stringify(ontology, null, 2)}\n`, "utf8");
      const stat = await fsp.stat(methodologyPath);
      artifacts.push({ stage: "methodology", uri: methodologyUri, sha256: await hashFile(methodologyPath), bytes: stat.size });
    }

    const executionRoot = path.join(capsuleDir, "staging", "execution");
    for (const executionPath of await walkFiles(executionRoot)) {
      const uri = path.relative(capsuleDir, executionPath).replaceAll(path.sep, "/");
      const stat = await fsp.stat(executionPath);
      artifacts.push({ stage: "qc", uri, sha256: await hashFile(executionPath), bytes: stat.size });
    }

    const capsule: QuarterCapsule = {
      period: brief.period,
      capsuleId: brief.capsuleId,
      state: "staging",
      instrumentPlan: [
        { instrument: "liveness", state: "required", reason: null },
        { instrument: "profile", state: "required", reason: null },
        { instrument: "axe", state: "required", reason: null },
        { instrument: "lighthouse", state: "disabled", reason: "Q3 2026 instrument plan" },
      ],
      artifacts,
    };
    await writeQuarterCapsuleStaging(capsuleDir, capsule);
    ctx.state.manifest = manifestWithDir;
  }
}

const walkFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files.sort();
};

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
  return { records: [...iterateAssetStates(coreDbPath)] };
}

export function* iterateAssetStates(coreDbPath: string): Generator<AssetStateRecord> {
  const db = new Database(coreDbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT s.id, s.domain, s.hwo_uid, s.hwo_provenance, s.bundesland, s.gemeinde,
             m.mapping_system, m.target_code, m.target_label, m.source
      FROM sites s
      LEFT JOIN site_hwo_mappings m ON m.site_id = s.id
      ORDER BY s.id, m.mapping_system, m.target_code
    `).iterate() as IterableIterator<CoreSite & Partial<Omit<CoreMapping, "site_id">>>;

    let current: CoreSite | null = null;
    let mappings: AssetStateMapping[] = [];
    let gewerkGroup: string | null = null;
    const emitCurrent = (): AssetStateRecord | null =>
      current
        ? {
            asset_id: deriveAssetId(current.domain),
            domain: current.domain,
            gewerk_group: gewerkGroup,
            hwo_uid: current.hwo_uid,
            hwo_provenance: current.hwo_provenance,
            bundesland: current.bundesland,
            gemeinde: current.gemeinde,
            mappings,
          }
        : null;

    for (const row of rows) {
      if (current && row.id !== current.id) {
        const record = emitCurrent();
        if (record) yield record;
        mappings = [];
        gewerkGroup = null;
      }
      current = row;
      if (row.mapping_system && row.target_code && row.source) {
        mappings.push({
          mapping_system: row.mapping_system,
          target_code: row.target_code,
          target_label: row.target_label ?? null,
          source: row.source,
        });
        if (row.mapping_system === "destatis_group") gewerkGroup = row.target_code;
      }
    }
    const finalRecord = emitCurrent();
    if (finalRecord) yield finalRecord;
  } finally {
    db.close();
  }
}
