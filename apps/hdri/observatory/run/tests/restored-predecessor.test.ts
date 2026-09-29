/*
<MODULE_CONTRACT>
<purpose>Test restored-predecessor validation with real signed temporary capsules and explicitly synthetic archive bytes.</purpose>
<non-goals><item>Does not simulate R2 transfer or archive extraction; tests the pinned-record consumption boundary.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: reject missing, altered, wrong-quarter and unsigned restored closure.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { sealQuarterCapsule, type QuarterCapsule, type CapsuleArtifact } from "@syrokomskyi/factory-core";
import { verifyRestoredPredecessor } from "../release/restored-predecessor";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-prior-restore-")); roots.push(root);
  const source = path.join(root, "source"), restore = path.join(root, "restored");
  await fs.mkdir(source); await fs.mkdir(restore);
  const artifacts: CapsuleArtifact[] = [];
  for (const stage of ["frame", "emit", "identity", "vault", "methodology", "publication", "liveness"] as const) {
    const uri = `${stage}.txt`, bytes = `synthetic-${stage}`;
    await fs.writeFile(path.join(restore, uri), bytes);
    artifacts.push({ stage, uri, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
  }
  const capsule: QuarterCapsule = { period: "2026-q2", capsuleId: "019c0000-0000-7000-8000-000000000001",
    deviceId: "fixture-device", state: "sealed", artifacts,
    instrumentPlan: ["liveness", "profile", "axe", "lighthouse"].map(instrument => ({
      instrument: instrument as QuarterCapsule["instrumentPlan"][number]["instrument"], state: "disabled", reason: "Synthetic tests only",
    })) };
  const key = { ...generateSigningKey(), signingKeyId: "fixture-key", collectorId: "fixture-device" };
  const manifest = await sealQuarterCapsule(restore, capsule, key);
  const archive = path.join(root, "archive.bin"), downloadedArchive = path.join(root, "downloaded.bin");
  await fs.writeFile(archive, "synthetic transfer bytes, not a tar archive");
  await fs.copyFile(archive, downloadedArchive);
  const receipt = { schema: "hdri-sealed-capsule-byte-restore@1", period: "2026-q2", capsuleId: capsule.capsuleId,
    status: "declared-closure-restored-not-scientific-rebuild", source, restore, archive,
    startedAt: "2026-09-27T01:00:00Z", completedAt: "2026-09-27T01:01:00Z",
    archiveSha256: hash(await fs.readFile(archive)), capsuleManifestSha256: hash(await fs.readFile(manifest)),
    declaredArtifacts: 7, archivedFiles: 9 };
  const options = { receiptPath: path.join(root, "receipt.json"), receiptSha256: "", downloadedArchive,
    currentPeriod: "2026-q3", keys: new Map([[key.signingKeyId, key]]) };
  const save = async () => { const bytes = JSON.stringify(receipt); await fs.writeFile(options.receiptPath, bytes); options.receiptSha256 = hash(bytes); };
  await save(); return { root, receipt, options, save };
}
test("verifies all restored declared artifacts and signature without opening SQLite or fetching remote data", async () => {
  const f = await fixture();
  expect(await verifyRestoredPredecessor(f.options)).toMatchObject({ restoredPeriod: "2026-q2",
    declaredArtifactsVerified: 7, receiptSha256: f.options.receiptSha256, signingKeyId: "fixture-key" });
});
test("rejects receipt substitution and wrong predecessor period", async () => {
  const f = await fixture();
  await expect(verifyRestoredPredecessor({ ...f.options, receiptSha256: "0".repeat(64) })).rejects.toThrow("RECEIPT_DIGEST_MISMATCH");
  await expect(verifyRestoredPredecessor({ ...f.options, currentPeriod: "2026-q4" })).rejects.toThrow("RECEIPT_SCOPE_INVALID");
});
test("rejects changed downloaded archive bytes", async () => {
  const f = await fixture(); await fs.writeFile(f.options.downloadedArchive, "changed");
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow("ARCHIVE_DIGEST_MISMATCH");
});
test("rejects corrupted restored evidence despite a matching signed manifest", async () => {
  const f = await fixture(); await fs.writeFile(path.join(f.receipt.restore, "vault.txt"), "changed");
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow();
});
test("rejects missing verification authority and modified signatures", async () => {
  const f = await fixture();
  await expect(verifyRestoredPredecessor({ ...f.options, keys: new Map() })).rejects.toThrow("SIGNATURE_INVALID");
  const file = path.join(f.receipt.restore, "capsule-signature.json");
  const signature = JSON.parse(await fs.readFile(file, "utf8"));
  await fs.writeFile(file, JSON.stringify({ ...signature, collectorId: "another-device" }));
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow("SIGNATURE_INVALID");
});
test("a source path or archive path reused as its own recovered copy fails", async () => {
  const f = await fixture();
  await expect(verifyRestoredPredecessor({ ...f.options, downloadedArchive: f.receipt.archive })).rejects.toThrow("DISTINCT_COPY_REQUIRED");
  f.receipt.source = f.receipt.restore; await f.save();
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow("DISTINCT_COPY_REQUIRED");
});
test("rejects inaccurate artifact accounting and reversed recovery chronology", async () => {
  const f = await fixture(); f.receipt.declaredArtifacts = 0; await f.save();
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow("CAPSULE_SCOPE_INVALID");
  f.receipt.completedAt = "2026-09-26T00:00:00Z"; await f.save();
  await expect(verifyRestoredPredecessor(f.options)).rejects.toThrow("RECEIPT_SCOPE_INVALID");
});
