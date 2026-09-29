/*
<MODULE_CONTRACT>
<purpose>Verify restored-predecessor artifacts and signatures against an explicitly pinned completed byte-recovery record.</purpose>
<non-goals><item>Does not download archives, open SQLite, replay science or authenticate an unsigned recovery record's remote-origin claim.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Require real restored bytes and signed closure; a marker file or empty inventory cannot pass.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: bind predecessor restoration QC to retained recovery facts without repeating the transfer.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readBoundedFile } from "@warpgogol/pipeline-node";
import { verifyQuarterCapsuleArtifacts, verifyQuarterCapsuleSignature,
  type QuarterCapsule, type CapsuleSignature } from "@syrokomskyi/factory-core";
import type { VerificationKey } from "@syrokomskyi/observatory-crypto";
import { sha256File } from "./release-contract";

const HASH = /^[a-f0-9]{64}$/;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function verifyRestoredPredecessor(options: {
  receiptPath: string; receiptSha256: string; downloadedArchive: string;
  currentPeriod: string; keys: ReadonlyMap<string, VerificationKey>;
}) {
  const match = /^(\d{4})-q([1-4])$/.exec(options.currentPeriod);
  if (!match || !HASH.test(options.receiptSha256)) throw new Error("RESTORE_EXPLICIT_SCOPE_PIN_REQUIRED");
  const year = Number(match[1]), quarter = Number(match[2]);
  const priorPeriod = quarter === 1 ? `${year - 1}-q4` : `${year}-q${quarter - 1}`;
  const receiptBytes = await readBoundedFile(path.resolve(options.receiptPath), 64 * 1024);
  if (digest(receiptBytes) !== options.receiptSha256) throw new Error("RESTORE_RECEIPT_DIGEST_MISMATCH");
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  if (receipt.schema !== "hdri-sealed-capsule-byte-restore@1" ||
    receipt.status !== "declared-closure-restored-not-scientific-rebuild" || receipt.period !== priorPeriod ||
    typeof receipt.capsuleId !== "string" || !receipt.capsuleId ||
    ![receipt.archiveSha256, receipt.capsuleManifestSha256].every(value => typeof value === "string" && HASH.test(value)) ||
    ![receipt.source, receipt.restore, receipt.archive].every(value => typeof value === "string" && path.isAbsolute(value)) ||
    !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) ||
    Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt)) throw new Error("RESTORE_RECEIPT_SCOPE_INVALID");
  const restored = await fs.realpath(receipt.restore);
  if (restored === await fs.realpath(receipt.source) ||
    await fs.realpath(receipt.archive) === await fs.realpath(options.downloadedArchive))
    throw new Error("RESTORE_DISTINCT_COPY_REQUIRED");
  for (const archive of [receipt.archive, options.downloadedArchive]) {
    const stat = await fs.lstat(archive);
    if (!stat.isFile() || stat.size === 0 || await sha256File(archive) !== receipt.archiveSha256)
      throw new Error("RESTORE_ARCHIVE_DIGEST_MISMATCH");
  }
  const manifestPath = path.join(restored, "capsule-manifest.json");
  const manifestBytes = await readBoundedFile(manifestPath, 64 * 1024 * 1024);
  if (digest(manifestBytes) !== receipt.capsuleManifestSha256) throw new Error("RESTORE_MANIFEST_DIGEST_MISMATCH");
  const capsule = JSON.parse(manifestBytes.toString("utf8")) as QuarterCapsule;
  if (capsule.state !== "sealed" || capsule.period !== priorPeriod || capsule.capsuleId !== receipt.capsuleId ||
    capsule.legacy !== undefined || !capsule.deviceId || capsule.artifacts.length === 0 ||
    (capsule.artifactInventories?.length ?? 0) !== 0 || receipt.declaredArtifacts !== capsule.artifacts.length ||
    receipt.archivedFiles !== capsule.artifacts.length + 2) throw new Error("RESTORE_CAPSULE_SCOPE_INVALID");
  const signatureBytes = await readBoundedFile(path.join(restored, "capsule-signature.json"), 64 * 1024);
  const signature = JSON.parse(signatureBytes.toString("utf8")) as CapsuleSignature;
  const key = options.keys.get(signature.signingKeyId);
  if (!key || signature.schemaVersion !== 1 || signature.collectorId !== capsule.deviceId ||
    key.collectorId !== capsule.deviceId || !verifyQuarterCapsuleSignature(capsule, signature, key))
    throw new Error("RESTORE_SIGNATURE_INVALID");
  await verifyQuarterCapsuleArtifacts(restored, capsule);
  if (digest(await readBoundedFile(manifestPath, 64 * 1024 * 1024)) !== receipt.capsuleManifestSha256 ||
    digest(await readBoundedFile(path.resolve(options.receiptPath), 64 * 1024)) !== options.receiptSha256)
    throw new Error("RESTORE_INPUT_CHANGED");
  return { evidenceSchema: "hdri-restored-predecessor-check@1" as const, restoredPeriod: priorPeriod,
    restoredCapsuleId: capsule.capsuleId, receiptSha256: options.receiptSha256,
    capsuleManifestSha256: receipt.capsuleManifestSha256 as string,
    capsuleSignatureSha256: digest(signatureBytes), archiveSha256: receipt.archiveSha256 as string,
    signingKeyId: signature.signingKeyId, verificationKeySha256: digest(Buffer.from(key.publicKeyPem)),
    declaredArtifactsVerified: capsule.artifacts.length, recoveryCompletedAt: receipt.completedAt as string };
}
