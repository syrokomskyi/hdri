/*
<MODULE_CONTRACT>
<purpose>Assemble and seal the converted Q2 baseline as a QuarterCapsule: carry the preserved signed source-ledger closure and stage products byte-identical (inventory-verified), add the conversion products, and seal via sealQuarterCapsule.</purpose>
<non-goals>
  <item>Does not synthesize, re-sign, or alter preserved Q2 evidence — the capsule signature attests the new manifest only.</item>
  <item>Does not change verifyPriorCapsule or the sealed-capsule contract; the converted capsule satisfies the existing admission path.</item>
</non-goals>
<!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0129: seal the converted baseline as a first-class prior capsule carrying the preserved signed ledger closure.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Every preserved byte is hash-verified against the preservation inventory before copying; a mismatch refuses sealing. No instrument is ever marked required — Q2 has no stage-seal evidence and none may be fabricated.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  KNOWN_INSTRUMENTS,
  sealQuarterCapsule,
  type CapsuleArtifact,
  type CapsuleId,
  type InstrumentPlanEntry,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import type { SigningKeyConfig } from "@syrokomskyi/observatory-crypto";
import { inspectRetainedFile, readBoundedFile } from "@warpgogol/pipeline-node";
import type { BaselineClosureMaterializationReport } from "./baseline-closure-materialization.js";
import type { InventoryEntry } from "./inventory.js";

const DISABLED_REASON =
  "Converted baseline — Q2 predates the seal-evidence contract; no stage seals exist and none may be fabricated.";

export const CONVERTED_BASELINE_INSTRUMENT_PLAN: readonly InstrumentPlanEntry[] =
  KNOWN_INSTRUMENTS.map((instrument) => ({
    instrument,
    state: "disabled" as const,
    reason: DISABLED_REASON,
  }));

export type PreservationInventory = Readonly<{
  sourceRoots: readonly string[];
  entries: readonly InventoryEntry[];
}>;

export type SealConvertedBaselineCapsuleOptions = Readonly<{
  /** apps/hdri/capsules/<deviceId>/<period>/<capsuleId>/ */
  capsuleDir: string;
  /** Original Q2 capsule dir (inventory-pinned, read-only source). */
  preservedCapsuleRoot: string;
  /** Parsed preservation-inventory.json (schema hdri-preservation-input@1). */
  inventory: PreservationInventory;
  /** The materialized converted baseline (observatory.db). */
  convertedBaselinePath: string;
  /** The published Q2 dashboard bundle dir (periods/2026-q2/). */
  publicationDir: string;
  /** The materialization report — persisted into the capsule as qc evidence. */
  report: BaselineClosureMaterializationReport;
  identity: Readonly<{ period: string; capsuleId: CapsuleId; deviceId: string }>;
  signingKey: SigningKeyConfig;
}>;

export type SealedBaselineCapsule = Readonly<{
  manifestPath: string;
  manifestSha256: string;
  capsuleId: string;
}>;

const copyVerifiedArtifact = async (
  sourcePath: string,
  destPath: string,
  pinned: Readonly<{ sha256: string; bytes: number }>,
): Promise<void> => {
  const source = await inspectRetainedFile(sourcePath);
  if (source.sha256 !== pinned.sha256 || source.bytes !== pinned.bytes)
    throw new Error(`PRESERVED_ARTIFACT_UNVERIFIED: ${sourcePath}`);
  try {
    const existing = await inspectRetainedFile(destPath);
    if (existing.sha256 === pinned.sha256 && existing.bytes === pinned.bytes) return;
    throw new Error(`CAPSULE_ARTIFACT_CONFLICT: ${destPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(sourcePath, destPath);
  const copied = await inspectRetainedFile(destPath);
  if (copied.sha256 !== pinned.sha256 || copied.bytes !== pinned.bytes)
    throw new Error(`PRESERVED_ARTIFACT_UNVERIFIED: ${destPath}`);
};

const writeJsonArtifact = async (destPath: string, value: unknown): Promise<void> => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await readBoundedFile(destPath, 64 * 1024 * 1024);
    if (existing.toString("utf8") === bytes) return;
    throw new Error(`CAPSULE_ARTIFACT_CONFLICT: ${destPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, bytes, "utf8");
};

const exportIdentityMap = async (
  convertedBaselinePath: string,
  destPath: string,
  period: string,
): Promise<void> => {
  const db = new Database(convertedBaselinePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        "SELECT provisional_id, canonical_id, domain, first_seen FROM asset_id_map ORDER BY provisional_id",
      )
      .all() as {
      provisional_id: string;
      canonical_id: string;
      domain: string;
      first_seen: string;
    }[];
    await writeJsonArtifact(destPath, {
      schema: "hdri-baseline-identity-map@1",
      period,
      entries: rows.map((row) => ({
        provisionalId: row.provisional_id,
        canonicalId: row.canonical_id,
        domain: row.domain,
        firstSeen: row.first_seen,
      })),
    });
  } finally {
    db.close();
  }
};

export const sealConvertedBaselineCapsule = async (
  opts: SealConvertedBaselineCapsuleOptions,
): Promise<SealedBaselineCapsule> => {
  const { capsuleDir, preservedCapsuleRoot, inventory, identity, report, signingKey } = opts;
  if (
    !inventory.sourceRoots.length ||
    path.resolve(inventory.sourceRoots[0]!) !== path.resolve(preservedCapsuleRoot)
  )
    throw new Error("PRESERVED_CAPSULE_ROOT_MISMATCH");

  // The preserved capsule manifest is the authoritative artifact list: every
  // entry must be pinned identically by the preservation inventory and the
  // on-disk bytes before it may enter the converted capsule.
  const preservedManifest = JSON.parse(
    (
      await readBoundedFile(
        path.join(preservedCapsuleRoot, "capsule-manifest.json"),
        64 * 1024 * 1024,
      )
    ).toString("utf8"),
  ) as QuarterCapsule;
  if (
    preservedManifest.period !== identity.period ||
    preservedManifest.state !== "sealed" ||
    !Array.isArray(preservedManifest.artifacts)
  )
    throw new Error("PRESERVED_CAPSULE_MANIFEST_INVALID");

  const inventoryByRole = new Map(inventory.entries.map((entry) => [entry.role, entry]));
  const artifacts: CapsuleArtifact[] = [];
  for (const artifact of preservedManifest.artifacts) {
    const pin = inventoryByRole.get(`source-0000/${artifact.uri}`);
    if (!pin || pin.sha256 !== artifact.sha256 || pin.bytes !== artifact.bytes)
      throw new Error(`PRESERVED_ARTIFACT_PIN_MISMATCH: ${artifact.uri}`);
    await copyVerifiedArtifact(
      path.join(preservedCapsuleRoot, artifact.uri),
      path.join(capsuleDir, artifact.uri),
      artifact,
    );
    artifacts.push(artifact);
  }

  // Conversion products: identity export, the converted baseline itself, the
  // published Q2 bundle, and the closure report as qc evidence.
  const identityUri = "artifacts/identity/asset-id-map.json";
  await exportIdentityMap(
    opts.convertedBaselinePath,
    path.join(capsuleDir, identityUri),
    identity.period,
  );

  const vaultUri = `artifacts/vault/${identity.deviceId}/observatory.db`;
  await copyVerifiedArtifact(opts.convertedBaselinePath, path.join(capsuleDir, vaultUri), {
    sha256: report.target.sha256,
    bytes: report.target.bytes,
  });

  const publicationFiles = (await fs.readdir(opts.publicationDir))
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (!publicationFiles.length) throw new Error("PUBLICATION_BUNDLE_EMPTY");
  for (const name of publicationFiles) {
    const sourcePath = path.join(opts.publicationDir, name);
    const digest = await inspectRetainedFile(sourcePath);
    await copyVerifiedArtifact(
      sourcePath,
      path.join(capsuleDir, "artifacts/publication", name),
      digest,
    );
  }

  const reportUri = "staging/conversion/baseline-closure-report.json";
  await writeJsonArtifact(path.join(capsuleDir, reportUri), report);

  for (const [stage, uri] of [
    ["identity", identityUri],
    ["vault", vaultUri],
    ["qc", reportUri],
  ] as const) {
    const digest = await inspectRetainedFile(path.join(capsuleDir, uri));
    artifacts.push({ stage, uri, sha256: digest.sha256, bytes: digest.bytes });
  }
  for (const name of publicationFiles) {
    const uri = `artifacts/publication/${name}`;
    const digest = await inspectRetainedFile(path.join(capsuleDir, uri));
    artifacts.push({ stage: "publication", uri, sha256: digest.sha256, bytes: digest.bytes });
  }

  const capsule: QuarterCapsule = {
    period: identity.period,
    capsuleId: identity.capsuleId,
    deviceId: identity.deviceId,
    state: "sealed",
    instrumentPlan: [...CONVERTED_BASELINE_INSTRUMENT_PLAN],
    artifacts,
  };
  const manifestPath = await sealQuarterCapsule(capsuleDir, capsule, signingKey);
  const manifestSha256 = createHash("sha256")
    .update(await readBoundedFile(manifestPath, 64 * 1024 * 1024))
    .digest("hex");
  return { manifestPath, manifestSha256, capsuleId: identity.capsuleId };
};
