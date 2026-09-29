import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { sealQuarterCapsule, type CapsuleArtifact, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { createRebuildReceipt, requiredScientificReports } from "../release/release-contract";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const cli = path.resolve("tools/quarter-validate.ts");
const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-quarter-validation-")); roots.push(root);
  const id = "0198f3a4-5b6c-7d8e-9f01-234567890abc";
  const artifacts: CapsuleArtifact[] = [];
  async function retain(uri: string, stage: CapsuleArtifact["stage"], content: string) {
    const file = path.join(root, uri); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content);
    artifacts.push({ uri, stage, sha256: hash(content), bytes: Buffer.byteLength(content) }); return file;
  }
  for (const stage of ["frame", "emit", "identity", "vault", "liveness"] as const)
    await retain(`artifacts/${stage}/fixture.txt`, stage, `test-only-${stage}`);
  await retain("artifacts/methodology/publication-scope.yaml", "methodology", JSON.stringify({
    schema: "hdri-publication-intent@1", period: "2026-q3", capsuleId: id,
    requestedProducts: ["availability"], excludedProducts: ["cross-section", "panel", "post-stratified"],
    claims: [], nonClaims: [], authority: "test-only", releaseAuthority: "none; all applicable scientific, privacy and custody gates remain required",
  }));
  await retain("artifacts/publication/availability.json", "publication", "[]");
  const manifestBytes = JSON.stringify({ schema: "hdri-public-manifest@1", policyDigest: "a".repeat(64), kAnonymityMin: 12,
    products: [{ schema: "hdri-public-product@1", product: "availability", format: "json", contentSha256: hash("[]"), bytes: 2,
      policySha256: "a".repeat(64), schemaId: "test-only", sourceAggregateSha256: "b".repeat(64) }] });
  const publicManifestPath = await retain("artifacts/publication/public-manifest.json", "publication", manifestBytes);
  const capsule: QuarterCapsule = { capsuleId: id, period: "2026-q3", state: "candidate", artifacts,
    instrumentPlan: ["liveness", "profile", "axe", "lighthouse"].map(instrument => ({
      instrument: instrument as QuarterCapsule["instrumentPlan"][number]["instrument"], state: "disabled", reason: "Synthetic CLI fixture only",
    })) };
  const capsuleBytes = JSON.stringify(capsule);
  const capsuleManifestPath = path.join(root, "capsule-candidate.json"); await fs.writeFile(capsuleManifestPath, capsuleBytes);
  const evidenceDir = path.join(root, "artifacts/qc/release"); await fs.mkdir(evidenceDir, { recursive: true });
  for (const [filename, entry] of requiredScientificReports(["availability"])) await fs.writeFile(path.join(evidenceDir, filename), JSON.stringify({
    schemaVersion: "1", reportType: entry.reportType, capsuleId: id, period: "2026-q3", inputFingerprint: "a".repeat(64),
    status: "pass", violations: [], warnings: [], hardSuppressions: [], checkedAt: "2026-09-27T00:00:00Z",
  }));
  const plannedSealedBytes = `${JSON.stringify({ ...capsule, state: "sealed" }, null, 2)}\n`;
  const receipt = createRebuildReceipt(hash(plannedSealedBytes), "b".repeat(64), "c".repeat(64), hash(manifestBytes), hash(manifestBytes),
    "d".repeat(64), "e".repeat(64), "f".repeat(64), "2026-09-27T00:00:00Z", "2026-09-27T00:05:00Z");
  const rebuildReceiptPath = path.join(root, "rebuild-receipt.json"); await fs.writeFile(rebuildReceiptPath, JSON.stringify(receipt));
  const input = path.join(root, "release-input.json"); await fs.writeFile(input, JSON.stringify({ schema: "hdri-release-input@1",
    capsuleManifestPath, evidenceDir, publicManifestPath, rebuildReceiptPath }));
  const run = () => JSON.parse(execFileSync(process.execPath, [tsx, "-C", "@syrokomskyi/source", cli, "--release-input", input],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  return { root, evidenceDir, run, rebuildReceiptPath, receipt, input, capsule, capsuleBytes,
    validation: path.join(evidenceDir, "validation-report.json") };
}
test("real validation CLI checks scoped reports and preserves identical validation bytes on retry", async () => {
  const data = await fixture();
  expect(data.run().scientificReportsVerified).toBe(6);
  const bytes = await fs.readFile(data.validation, "utf8");
  expect(data.run().status).toBe("pass");
  expect(await fs.readFile(data.validation, "utf8")).toBe(bytes);
});
test("existing validation file cannot bypass a now-missing applicable report", async () => {
  const data = await fixture(); data.run();
  const bytes = await fs.readFile(data.validation, "utf8");
  await fs.unlink(path.join(data.evidenceDir, "source-qc.json"));
  expect(data.run).toThrow();
  expect(await fs.readFile(data.validation, "utf8")).toBe(bytes);
});
test("rebuild from a different capsule prevents creating a validation report", async () => {
  const data = await fixture();
  await fs.writeFile(data.rebuildReceiptPath, JSON.stringify({ ...data.receipt, capsuleManifestSha256: "0".repeat(64) }));
  expect(data.run).toThrow();
  await expect(fs.access(data.validation)).rejects.toThrow();
});

test("the same reconstruction and validation remain valid after the actual capsule writer seals the candidate", async () => {
  const data = await fixture();
  expect(data.run().status).toBe("pass");
  const validation = await fs.readFile(data.validation, "utf8");
  const sealedPath = await sealQuarterCapsule(data.root, { ...data.capsule, state: "sealed" }, {
    ...generateSigningKey(), signingKeyId: "fixture-only", collectorId: "fixture-device",
  });
  expect(hash(await fs.readFile(sealedPath, "utf8"))).toBe(data.receipt.capsuleManifestSha256);
  const input = JSON.parse(await fs.readFile(data.input, "utf8"));
  await fs.writeFile(data.input, JSON.stringify({ ...input, capsuleManifestPath: sealedPath }));
  expect(data.run().status).toBe("pass");
  expect(await fs.readFile(data.validation, "utf8")).toBe(validation);
});

test("a receipt bound only to the provisional candidate bytes cannot validate a final release", async () => {
  const data = await fixture();
  await fs.writeFile(data.rebuildReceiptPath, JSON.stringify({ ...data.receipt, capsuleManifestSha256: hash(data.capsuleBytes) }));
  expect(data.run).toThrow();
  await expect(fs.access(data.validation)).rejects.toThrow();
});

test("raw staging cannot masquerade as a release candidate even with a matching receipt", async () => {
  const data = await fixture();
  const stagingBytes = JSON.stringify({ ...data.capsule, state: "staging" });
  await fs.writeFile(path.join(data.root, "capsule-candidate.json"), stagingBytes);
  await fs.writeFile(data.rebuildReceiptPath, JSON.stringify({ ...data.receipt, capsuleManifestSha256: hash(stagingBytes) }));
  expect(data.run).toThrow();
  await expect(fs.access(data.validation)).rejects.toThrow();
});
