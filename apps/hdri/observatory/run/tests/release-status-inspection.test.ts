import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { inspectReleaseArtifacts } from "../../tools/quarter-release-status";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-release-inspection-")); roots.push(root);
  const directory = path.join(root, "releases", "period=2026-q3"); await fs.mkdir(directory, { recursive: true });
  const envelope = { schema: "hdri-release-envelope@1", releaseId: "capsule-123", period: "2026-q3",
    measurementCapsuleSha256: "a".repeat(64), scientificInputSha256: "b".repeat(64), inventory: [],
    publicManifestSha256: "c".repeat(64), rebuildReceiptSha256: "d".repeat(64), keyBundleSha256: "e".repeat(64) };
  const file = path.join(directory, "capsule-123.json");
  await fs.writeFile(file, JSON.stringify(envelope, null, 2) + "\n");
  return { root, directory, file, envelope };
}
test("reads the writer path with explicit quarter and distinguishes file hash from signed object hash", async () => {
  const f = await fixture();
  const result = await inspectReleaseArtifacts(f.root, "2026-q3", "capsule-123");
  expect(result.envelopeFound).toBe(true);
  expect(result.envelopeSha256).toBe(createHash("sha256").update(JSON.stringify(f.envelope)).digest("hex"));
  expect(result.envelopeFileSha256).not.toBe(result.envelopeSha256);
  expect(result.status).toBe("unverified"); expect(result.releaseState).toBeNull();
});
test("a fabricated attestation cannot establish publication, delivery or custody", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.directory, "capsule-123-attestation.json"), JSON.stringify({
    schema: "hdri-publication-attestation@1", releaseId: "capsule-123", signature: "fabricated", replicaReceiptSha256s: [],
  }));
  const result = await inspectReleaseArtifacts(f.root, "2026-q3", "capsule-123");
  expect(result.status).toBe("unverified"); expect(result.releaseState).toBeNull();
  expect(result.replicasVerified).toBeNull(); expect(result.attestationDelivered).toBeNull();
});
test("wrong-quarter envelope fails rather than upgrading the state", async () => {
  const f = await fixture();
  await fs.writeFile(f.file, JSON.stringify({ ...f.envelope, period: "2026-q2" }));
  const result = await inspectReleaseArtifacts(f.root, "2026-q3", "capsule-123");
  expect(result.status).toBe("fail"); expect(result.violations).toContain("envelope_scope_mismatch");
  expect(result.releaseState).toBeNull();
});
test("missing or malformed envelope is not a prepared release", async () => {
  const f = await fixture(); await fs.writeFile(f.file, "null");
  expect((await inspectReleaseArtifacts(f.root, "2026-q3", "capsule-123")).status).toBe("fail");
  const missing = await inspectReleaseArtifacts(f.root, "2026-q3", "missing");
  expect(missing.violations).toContain("envelope_not_found"); expect(missing.releaseState).toBeNull();
});
test.each([["2026", "capsule-123"], ["2026-q3", "../escape"]])("rejects guessed or escaping scope", async (period, id) => {
  const f = await fixture();
  await expect(inspectReleaseArtifacts(f.root, period, id)).rejects.toThrow("SCOPE_INVALID");
});
