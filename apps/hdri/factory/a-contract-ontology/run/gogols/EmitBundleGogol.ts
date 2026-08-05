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
  <item>Write immutable emit bundles inside the period-and-capsule-addressed artifact root.</item>
  <item>Fail closed on existing staging closure and retain consistent SQLite snapshots plus transitive raw source evidence.</item>
  <item>Verify signed ledger, frame and occurrence closure before retaining any source evidence.</item>
  <item>Require consumer-verified target, event, CAS and signed stage closure before emitting quarterly artifacts.</item>
  <item>RFC-0046: read instrumentPlan from brief instead of hardcoding; derive requiredStages from plan.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: emit-bundle contract is immutable; never change manifest schema without version bump

import "@syrokomskyi/observatory-crypto/auto-env";
import Database from "better-sqlite3";
import fsp from "node:fs/promises";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { deriveAssetId } from "@syrokomskyi/observatory-core";
import type { AssetStateMapping, AssetStateRecord } from "@syrokomskyi/observatory-core";
import { EmitBundleWriter } from "@syrokomskyi/observatory-emit";
import {
  getTransparencyKeysDir,
  loadVerificationKeys,
  type SignedObservation,
} from "@syrokomskyi/observatory-crypto";
import {
  copyVerifiedArtifact,
  DEFAULT_INSTRUMENT_PLAN,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterExecutionClosure,
  verifySourceClosure,
  writeQuarterCapsuleStaging,
  type CapsuleArtifact,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { inputDir, outputRootDir } from "../config.js";

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
    const {
      brief,
      signedObservationDbPath,
      coreDbs,
      discoveredPages,
      livenessDbs,
      axeDbs,
      ontology,
    } = ctx.state;
    if (!signedObservationDbPath) {
      throw new Error("No signed observation store — run sign-bundle first");
    }

    const factoryRunId = brief.capsuleId;
    const capsuleDir = path.join(outputRootDir, "capsules", brief.period, brief.capsuleId);
    const emitDir = path.join(capsuleDir, "artifacts", "emit");
    const stagingPath = path.join(capsuleDir, "capsule-staging.json");
    const verificationKeys = await loadVerificationKeys(getTransparencyKeysDir());
    const instrumentPlan = brief.instrumentPlan ?? DEFAULT_INSTRUMENT_PLAN;
    const requiredStages = instrumentPlan
      .filter((entry) => entry.state === "required")
      .map((entry) => entry.instrument);
    try {
      await fsp.access(path.join(capsuleDir, "capsule-manifest.json"));
      throw new Error(`Quarter capsule is already sealed: ${brief.period}/${brief.capsuleId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      const existing = JSON.parse(await fsp.readFile(stagingPath, "utf8")) as QuarterCapsule;
      if (
        existing.state !== "staging" ||
        existing.period !== brief.period ||
        existing.capsuleId !== brief.capsuleId
      ) {
        throw new Error(
          `Quarter capsule staging identity mismatch: ${brief.period}/${brief.capsuleId}`,
        );
      }
      await verifyQuarterCapsuleArtifacts(capsuleDir, existing);
      await verifyQuarterExecutionClosure(capsuleDir, requiredStages, verificationKeys);
      ctx.state.manifest = JSON.parse(
        await fsp.readFile(path.join(emitDir, "manifest.json"), "utf8"),
      );
      console.log(`[emit-bundle] Existing staging capsule verified; no artifacts rewritten.`);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await verifyQuarterExecutionClosure(capsuleDir, requiredStages, verificationKeys);
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
    const committedObservations = writer.committedObservationCount;
    const signedDb = new Database(signedObservationDbPath, { readonly: true, fileMustExist: true });
    try {
      const counts = signedDb
        .prepare(
          `
        SELECT
          (SELECT COUNT(*) FROM resolved_observations) AS resolved,
          (SELECT COUNT(*) FROM signed_observations) AS signed,
          (SELECT COALESCE(MAX(seq), 0) FROM signed_observations) AS max_seq
      `,
        )
        .get() as { resolved: number; signed: number; max_seq: number };
      if (
        counts.resolved === 0 ||
        counts.signed !== counts.resolved ||
        counts.max_seq !== counts.signed
      ) {
        throw new Error(
          `Signed observation closure mismatch: resolved=${counts.resolved}, signed=${counts.signed}, max_seq=${counts.max_seq}`,
        );
      }
      if (committedObservations > counts.signed) {
        throw new Error("Signed observation store is shorter than the sealed emit checkpoint");
      }
      const rows = signedDb
        .prepare(
          `SELECT payload_json
           FROM signed_observations
           WHERE seq > ?
           ORDER BY seq`,
        )
        .iterate(committedObservations) as IterableIterator<{ payload_json: string }>;
      for (const row of rows) {
        await writer.writeObservation(JSON.parse(row.payload_json) as SignedObservation);
      }
      const conflictCount = (
        signedDb.prepare("SELECT COUNT(*) AS n FROM resolved_conflicts").get() as { n: number }
      ).n;
      const committedEvidence = writer.committedEvidenceCount;
      if (committedEvidence > conflictCount) {
        throw new Error("Conflict evidence store is shorter than the sealed emit checkpoint");
      }
      const conflicts = signedDb
        .prepare(
          `
        SELECT conflict_key, winner_observation_id, loser_observation_id, loser_payload_json
        FROM resolved_conflicts
        WHERE seq > ?
        ORDER BY seq
      `,
        )
        .iterate(committedEvidence) as IterableIterator<{
        conflict_key: string;
        winner_observation_id: string;
        loser_observation_id: string;
        loser_payload_json: string;
      }>;
      for (const conflict of conflicts) {
        await writer.writeEvidence({
          evidenceType: "observation-conflict",
          resolutionPolicyVersion: "latest-recorded-device-observation-v1",
          conflictKey: conflict.conflict_key,
          winnerObservationId: conflict.winner_observation_id,
          loserObservationId: conflict.loser_observation_id,
          loserObservation: JSON.parse(conflict.loser_payload_json),
        });
      }
    } finally {
      signedDb.close();
    }

    // ── Write asset states from upstream core_*.db ────────────────────────────
    let assetStateCount = 0;
    const committedAssetStates = writer.committedAssetStateCount;
    for (const coreDb of coreDbs) {
      for (const rec of iterateAssetStates(coreDb.coreDbPath)) {
        if (assetStateCount >= committedAssetStates) await writer.writeAssetState(rec);
        assetStateCount++;
      }
    }
    if (coreDbs.length > 0) {
      console.log(
        `[emit-bundle] Harvested ${assetStateCount} asset state(s) from ${coreDbs.length} core DB(s)`,
      );
    }
    if (assetStateCount < committedAssetStates) {
      throw new Error("Asset-state stream is shorter than the sealed emit checkpoint");
    }

    const manifest = await writer.commit();
    // Write manifest as step artifact.
    await fsp.writeFile(
      path.join(ctx.outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    const bundleHash = manifest.bundle_hash ?? "";
    console.log(
      `[emit-bundle] Wrote ${manifest.observation_count} observations, ${manifest.asset_state_count} asset states to ${emitDir}\n` +
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
      await fsp.unlink(destination).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
      const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
      try {
        const integrity = sourceDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
        if (integrity.some((row) => row.integrity_check !== "ok")) {
          throw new Error(`SQLite source failed integrity_check: ${source}`);
        }
        await sourceDb.backup(destination);
      } finally {
        sourceDb.close();
      }
      const snapshotDb = new Database(destination, { readonly: true, fileMustExist: true });
      try {
        const integrity = snapshotDb.pragma("integrity_check") as Array<{
          integrity_check: string;
        }>;
        if (integrity.some((row) => row.integrity_check !== "ok")) {
          throw new Error(`SQLite capsule snapshot failed integrity_check: ${uri}`);
        }
      } finally {
        snapshotDb.close();
      }
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256: await hashFile(destination), bytes: stat.size });
    };
    for (const item of livenessDbs) await retainDb("liveness", item.deviceId, item.livenessDbPath);
    for (const item of discoveredPages) await retainDb("profile", item.deviceId, item.pagesDbPath);
    for (const item of axeDbs) await retainDb("axe", item.deviceId, item.axeDbPath);

    const retainCasFile = async (
      stage: CapsuleArtifact["stage"],
      deviceId: string,
      source: string,
      relativeStoragePath: string,
      expectedSha256: string,
    ): Promise<void> => {
      const uri = `artifacts/${stage}/${deviceId}/${relativeStoragePath.replaceAll(path.sep, "/")}`;
      const destination = path.join(capsuleDir, uri);
      await copyVerifiedArtifact(source, destination, expectedSha256);
      const sha256 = await hashFile(destination);
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256, bytes: stat.size });
    };

    for (const item of discoveredPages) {
      const db = new Database(item.pagesDbPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db
          .prepare(
            "SELECT content_hash AS contentHash, storage_path AS storagePath FROM page_contents ORDER BY content_hash",
          )
          .all() as Array<{ contentHash: string; storagePath: string }>;
        const outputRoot = path.dirname(path.dirname(path.dirname(item.pagesDbPath)));
        for (const row of rows) {
          if (
            row.storagePath !==
            `data/content/${row.contentHash.slice(0, 2)}/${row.contentHash}.html`
          ) {
            throw new Error(`Non-canonical profile CAS path: ${row.storagePath}`);
          }
          await retainCasFile(
            "profile",
            item.deviceId,
            path.resolve(outputRoot, row.storagePath),
            row.storagePath,
            row.contentHash,
          );
        }
      } finally {
        db.close();
      }
    }

    for (const item of axeDbs) {
      const db = new Database(item.axeDbPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db
          .prepare(
            "SELECT DISTINCT report_sha256 AS reportSha256 FROM axe_runs WHERE report_sha256 IS NOT NULL ORDER BY report_sha256",
          )
          .all() as Array<{ reportSha256: string }>;
        const outputRoot = path.dirname(path.dirname(path.dirname(item.axeDbPath)));
        for (const row of rows) {
          const relative = `data/audit-reports/axe/${row.reportSha256.slice(0, 2)}/${row.reportSha256}.json`;
          await retainCasFile(
            "axe",
            item.deviceId,
            path.resolve(outputRoot, relative),
            relative,
            row.reportSha256,
          );
        }
      } finally {
        db.close();
      }
    }

    for (const item of coreDbs) {
      const ledgerRoot = path.resolve(path.dirname(item.coreDbPath), "..", "source-ledger");
      const sourceClosure = await verifySourceClosure(ledgerRoot, brief.period, verificationKeys);
      for (const manifest of sourceClosure.manifests) {
        const relativeSegment = `segments/${manifest.batchId}.json`;
        const segmentPath = path.join(ledgerRoot, relativeSegment);
        const segmentSha256 = sourceClosure.artifactSha256.get(relativeSegment);
        if (!segmentSha256)
          throw new Error(`Verified source hash is missing for segment: ${manifest.batchId}`);
        await retainCasFile(
          "frame",
          item.deviceId,
          segmentPath,
          `source-ledger/${relativeSegment}`,
          segmentSha256,
        );
        const batchRoot = path.resolve(inputDir, "batches", manifest.batchId);
        for (const file of manifest.files) {
          const source = path.resolve(batchRoot, file.relativePath);
          if (source !== batchRoot && !source.startsWith(`${batchRoot}${path.sep}`)) {
            throw new Error(`Source batch artifact escapes its batch root: ${file.relativePath}`);
          }
          await retainCasFile(
            "frame",
            item.deviceId,
            source,
            `source-ledger/raw/${manifest.batchId}/${file.relativePath}`,
            file.sha256,
          );
        }
      }
      for (const name of [
        `source-occurrences-${brief.period}.ndjson`,
        `frame-${brief.period}.json`,
        `frame-${brief.period}.manifest.json`,
      ]) {
        const source = path.join(ledgerRoot, "projections", name);
        const expectedSha256 = sourceClosure.artifactSha256.get(`projections/${name}`);
        if (!expectedSha256)
          throw new Error(`Verified source hash is missing for projection: ${name}`);
        await retainCasFile(
          "frame",
          item.deviceId,
          source,
          `source-ledger/projections/${name}`,
          expectedSha256,
        );
      }
    }
    if (!artifacts.some((artifact) => artifact.stage === "frame")) {
      throw new Error(`No frozen source frame found for ${brief.period}`);
    }

    for (const uri of [
      "manifest.json",
      ...manifest.observation_partitions.map((partition) => partition.uri),
      ...manifest.asset_state_partitions.map((partition) => partition.uri),
      ...manifest.evidence_partitions.map((partition) => partition.uri),
    ]) {
      const emitPath = path.join(emitDir, uri);
      const emitStat = await fsp.stat(emitPath);
      artifacts.push({
        stage: "emit",
        uri: `artifacts/emit/${uri}`,
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
      artifacts.push({
        stage: "methodology",
        uri: methodologyUri,
        sha256: await hashFile(methodologyPath),
        bytes: stat.size,
      });
    }

    for (const evidenceRoot of [
      path.join(capsuleDir, "staging", "execution"),
      path.join(capsuleDir, "staging", "stage-seals"),
      path.join(capsuleDir, "staging", "targets"),
    ]) {
      for (const evidencePath of await walkFiles(evidenceRoot)) {
        const uri = path.relative(capsuleDir, evidencePath).replaceAll(path.sep, "/");
        const stat = await fsp.stat(evidencePath);
        artifacts.push({
          stage: "qc",
          uri,
          sha256: await hashFile(evidencePath),
          bytes: stat.size,
        });
      }
    }

    const capsule: QuarterCapsule = {
      period: brief.period,
      capsuleId: brief.capsuleId,
      state: "staging",
      instrumentPlan,
      artifacts,
    };
    await writeQuarterCapsuleStaging(capsuleDir, capsule);
    ctx.state.manifest = manifest;
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
    const rows = db
      .prepare(
        `
      SELECT s.id, s.domain, s.hwo_uid, s.hwo_provenance, s.bundesland, s.gemeinde,
             m.mapping_system, m.target_code, m.target_label, m.source
      FROM sites s
      LEFT JOIN site_hwo_mappings m ON m.site_id = s.id
      ORDER BY s.id, m.mapping_system, m.target_code
    `,
      )
      .iterate() as IterableIterator<CoreSite & Partial<Omit<CoreMapping, "site_id">>>;

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
