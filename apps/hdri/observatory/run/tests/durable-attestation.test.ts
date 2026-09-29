import { afterEach, expect, test } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retainPublicationAttestation } from "../release/durable-attestation";
import { createReleaseEnvelope } from "../release/release-contract";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-attestation-")); roots.push(root);
  const keys = crypto.generateKeyPairSync("ed25519");
  return {
    file: path.join(root, "qc/publication-attestation.json"),
    envelope: createReleaseEnvelope("fixture-release", "2026-q3", "a".repeat(64), "b".repeat(64),
      [], "c".repeat(64), "d".repeat(64), "e".repeat(64)),
    replicaReceiptSha256s: ["f".repeat(64)], signingKeyId: "test-key",
    privateKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    custodyPolicySha256: "1".repeat(64),
  };
}
test("retry reuses exact verified signed bytes without requiring private-key access", async () => {
  const input = await fixture();
  const first = await retainPublicationAttestation(input);
  const bytes = await fs.readFile(input.file, "utf8");
  const second = await retainPublicationAttestation({ ...input, privateKeyPem: "not accessed on retry" });
  expect(second).toEqual(first);
  expect(await fs.readFile(input.file, "utf8")).toBe(bytes);
  expect((await fs.stat(input.file)).mode & 0o777).toBe(0o600);
});
test.each(["envelope", "receipts", "policy", "key"])("changed %s cannot reuse an earlier attestation", async change => {
  const input = await fixture();
  await retainPublicationAttestation(input);
  if (change === "envelope") input.envelope = { ...input.envelope, period: "2026-q4" };
  if (change === "receipts") input.replicaReceiptSha256s = ["2".repeat(64)];
  if (change === "policy") input.custodyPolicySha256 = "3".repeat(64);
  if (change === "key") input.signingKeyId = "other-key";
  await expect(retainPublicationAttestation(input)).rejects.toThrow("CONFLICT_OR_INVALID_SIGNATURE");
});
test.each(["signature", "timestamp", "extra-field"])("tampered %s fails without replacing retained evidence", async change => {
  const input = await fixture();
  const first = await retainPublicationAttestation(input);
  const tampered = { ...first, ...(change === "signature" ? { signature: "AAAA" } :
    change === "timestamp" ? { attestedAt: "2020-01-01T00:00:00.000Z" } : { extra: true }) };
  const bytes = JSON.stringify(tampered, null, 2) + "\n";
  await fs.writeFile(input.file, bytes);
  await expect(retainPublicationAttestation(input)).rejects.toThrow("CONFLICT_OR_INVALID_SIGNATURE");
  expect(await fs.readFile(input.file, "utf8")).toBe(bytes);
});
test("concurrent first attempts converge on one durable attestation", async () => {
  const input = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => retainPublicationAttestation(input)));
  for (const result of results) expect(result).toEqual(results[0]);
  expect(await fs.readdir(path.dirname(input.file))).toEqual(["publication-attestation.json"]);
});
test("symlink destination is rejected rather than followed", async () => {
  const input = await fixture();
  await retainPublicationAttestation(input);
  const link = path.join(path.dirname(input.file), "link.json");
  await fs.symlink(input.file, link);
  await expect(retainPublicationAttestation({ ...input, file: link })).rejects.toThrow();
});
