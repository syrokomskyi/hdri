/*
<MODULE_CONTRACT>
<purpose>Emits the canonical observation and asset-state bundle using EmitBundleWriter — this module handles emit bundle operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not sign observations — that is done by SignBundleGogol.</item>
  <item>Do not modify upstream databases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 B5: emit from admitted copies, retain harvest signatures and bind retries to the exact translation derivation.</item>
  <item>Resume archive retention after committed emission; missing retained artifacts remain fatal.</item>
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
  appendCapsuleArtifacts,
  appendCapsuleInventoryParts,
  createCapsuleInventoryWriter,
  copyVerifiedArtifact,
  DEFAULT_INSTRUMENT_PLAN,
  quarterCapsuleDir,
  sha256File,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterExecutionClosure,
  verifySourceClosure,
  type CapsuleArtifact,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { factoryRootDir, inputDir, localDeviceId } from "../config.js";
import { copyAdmittedSnapshot } from "../pipeline/admitted-snapshot.js";
import { bindEmissionDerivation, readVerifiedEmission } from "../pipeline/emission-resume.js";

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
      translationClosure,
    } = ctx.state;
    if (!signedObservationDbPath) {
      throw new Error("No signed observation store — run sign-bundle first");
    }
    if (!translationClosure) {
      throw new Error("No translation closure — run translate-ontology first");
    }
    if (translationClosure.unresolvedReferences > 0) {
      throw new Error(
        `Cannot emit bundle with ${translationClosure.unresolvedReferences} unresolved reference(s)`,
      );
    }
    if (translationClosure.expectedKeysSha256 !== translationClosure.emittedKeysSha256) {
      throw new Error(
        `Translation coverage mismatch: expected ${translationClosure.expectedKeysSha256}, emitted ${translationClosure.emittedKeysSha256}`,
      );
    }

    const factoryRunId = brief.capsuleId;
    // RFC-0128: capsule root is the neutral shared apps/hdri/capsules/ tree.
    const capsuleDir = quarterCapsuleDir(
      factoryRootDir,
      localDeviceId,
      brief.period,
      brief.capsuleId,
    );
    const emitDir = path.join(capsuleDir, "artifacts", "emit");
    const derivationPath = path.join(path.dirname(signedObservationDbPath), "derivation.json");
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
    const existing = JSON.parse(await fsp.readFile(stagingPath, "utf8")) as QuarterCapsule;
    if (
      existing.state !== "staging" ||
      existing.period !== brief.period ||
      existing.capsuleId !== brief.capsuleId ||
      existing.deviceId !== localDeviceId
    ) {
      throw new Error(
        `Quarter capsule staging identity mismatch: ${brief.period}/${brief.capsuleId}`,
      );
    }
    await verifyQuarterCapsuleArtifacts(capsuleDir, existing);
    await verifyQuarterExecutionClosure(capsuleDir, requiredStages, verificationKeys);
    await bindEmissionDerivation(emitDir, derivationPath);
    const emitIdentity = {
      app_id: APP_ID,
      collector_version: COLLECTOR_VERSION,
      ruleset_version: brief.ontologyVersion,
      ontology_version: brief.ontologyVersion,
      run_id: factoryRunId,
      period: brief.period,
    };
    let manifest = await readVerifiedEmission(emitDir, emitIdentity);
    if (manifest) {
      console.log(
        `[emit-bundle] Existing emit partitions verified; checking and completing retained evidence.`,
      );
    }
    if (!manifest) {
      const writer = new EmitBundleWriter(emitDir, emitIdentity);
      await writer.open();

      // ── Write observations ────────────────────────────────────────────────────
      const committedObservations = writer.committedObservationCount;
      const signedDb = new Database(signedObservationDbPath, {
        readonly: true,
        fileMustExist: true,
      });
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
        if ((await sha256File(coreDb.coreDbPath)) !== coreDb.snapshotSha256)
          throw new Error("Admitted harvest snapshot changed before emission");
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

      manifest = await writer.commit();
    }
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
    const inventory = createCapsuleInventoryWriter(capsuleDir);
    const originalArtifacts = new Map(
      existing.artifacts.map((artifact) => [artifact.uri, artifact]),
    );
    let indexed = 0;
    const indexArtifact = async (artifact: CapsuleArtifact): Promise<void> => {
      const original = originalArtifacts.get(artifact.uri);
      if (original) {
        if (
          original.sha256 !== artifact.sha256 ||
          original.bytes !== artifact.bytes ||
          original.stage !== artifact.stage
        )
          throw new Error(`Retained artifact conflicts with staging inventory: ${artifact.uri}`);
        return;
      }
      await inventory.append(artifact);
      if (++indexed % 100000 === 0)
        console.log(`[emit-bundle] Indexed ${indexed} retained artifacts`);
    };
    // Retain the exact admitted generation; never open or back up sealed SQLite originals.
    for (const item of [...livenessDbs, ...discoveredPages, ...axeDbs]) {
      const source = path.resolve(item.capsuleDir, item.artifact.uri);
      const destination = path.resolve(capsuleDir, item.artifact.uri);
      if (source !== destination)
        await copyVerifiedArtifact(source, destination, item.artifact.sha256);
      if (
        (await sha256File(destination)) !== item.artifact.sha256 ||
        (await fsp.stat(destination)).size !== item.artifact.bytes
      ) {
        throw new Error(`Admitted snapshot changed before retention: ${item.artifact.uri}`);
      }
      artifacts.push(item.artifact);
    }

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
      const sha256 = await sha256File(destination);
      const stat = await fsp.stat(destination);
      const artifact = { stage, uri, sha256, bytes: stat.size };
      if (
        stage === "profile" ||
        stage === "axe" ||
        relativeStoragePath.startsWith("source-ledger/raw/")
      )
        await indexArtifact(artifact);
      else artifacts.push(artifact);
    };

    for (const item of discoveredPages) {
      const scratch = await fsp.mkdtemp(path.join(ctx.outputDir, "profile-retain-"));
      let db: Database.Database | undefined;
      try {
        db = new Database(await copyAdmittedSnapshot(item, scratch), {
          readonly: true,
          fileMustExist: true,
        });
        const rows = db
          .prepare(
            "SELECT sha256 AS contentHash, storage_path AS storagePath FROM page_contents ORDER BY sha256",
          )
          .iterate() as IterableIterator<{ contentHash: string; storagePath: string }>;
        const outputRoot = item.sourceOutputRoot;
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
        db?.close();
        await fsp.rm(scratch, { recursive: true, force: true });
      }
    }

    for (const item of axeDbs) {
      const scratch = await fsp.mkdtemp(path.join(ctx.outputDir, "axe-retain-"));
      let db: Database.Database | undefined;
      try {
        db = new Database(await copyAdmittedSnapshot(item, scratch), {
          readonly: true,
          fileMustExist: true,
        });
        const rows = db
          .prepare(
            "SELECT DISTINCT report_sha256 AS reportSha256 FROM axe_runs WHERE report_sha256 IS NOT NULL ORDER BY report_sha256",
          )
          .iterate() as IterableIterator<{ reportSha256: string }>;
        const outputRoot = item.sourceOutputRoot;
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
        db?.close();
        await fsp.rm(scratch, { recursive: true, force: true });
      }
    }

    for (const item of coreDbs) {
      await retainCasFile(
        "frame",
        item.deviceId,
        item.sourceSnapshotPath,
        "harvest/source-snapshot.sqlite",
        item.snapshotSha256,
      );
      await retainCasFile(
        "frame",
        item.deviceId,
        item.sourceManifestPath,
        "harvest/source-signature.json",
        item.sourceManifestSha256,
      );
      const ledgerRoot = item.sourceLedgerRoot;
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
      "derivation.json",
      ...manifest.observation_partitions.map((partition) => partition.uri),
      ...manifest.asset_state_partitions.map((partition) => partition.uri),
      ...manifest.evidence_partitions.map((partition) => partition.uri),
    ]) {
      const emitPath = path.join(emitDir, uri);
      const emitStat = await fsp.stat(emitPath);
      artifacts.push({
        stage: "emit",
        uri: `artifacts/emit/${uri}`,
        sha256: await sha256File(emitPath),
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
        sha256: await sha256File(methodologyPath),
        bytes: stat.size,
      });
    }

    for (const evidenceRoot of [
      path.join(capsuleDir, "staging", "execution"),
      path.join(capsuleDir, "staging", "stage-seals"),
      path.join(capsuleDir, "staging", "targets"),
    ]) {
      for await (const evidencePath of walkFiles(evidenceRoot)) {
        const uri = path.relative(capsuleDir, evidencePath).replaceAll(path.sep, "/");
        const stat = await fsp.stat(evidencePath);
        await indexArtifact({
          stage: "qc",
          uri,
          sha256: await sha256File(evidencePath),
          bytes: stat.size,
        });
      }
    }

    // RFC-0128: the staging manifest was created at quarter-init and already
    // carries every stage's seal-time entries — append emit-time artifacts
    // (CAS files, emit partitions, methodology, remaining qc evidence) with
    // dedup; a conflicting re-run fails instead of rewriting the manifest.
    await appendCapsuleArtifacts(capsuleDir, artifacts);
    await appendCapsuleInventoryParts(capsuleDir, await inventory.finish());
    ctx.state.manifest = manifest;
  }
}

async function* walkFiles(root: string): AsyncGenerator<string> {
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
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) yield absolute;
      else throw new Error(`Unsupported retained evidence entry: ${absolute}`);
    }
  }
}

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
