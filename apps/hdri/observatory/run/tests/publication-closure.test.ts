import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { QuarterCapsule, CapsuleArtifact } from "@syrokomskyi/factory-core";
import { verifyPublicationClosure } from "../release/publication-closure";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
async function fixture(product = "availability") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-publication-closure-")); roots.push(root);
  const artifacts: CapsuleArtifact[] = [];
  const retain = async (uri: string, bytes: string, stage: CapsuleArtifact["stage"]) => {
    const file = path.join(root, uri); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
    artifacts.push({ uri, stage, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) }); return file;
  };
  await retain("artifacts/methodology/publication-scope.yaml", JSON.stringify({
    schema: "hdri-publication-intent@1", period: "2026-q3", capsuleId: "fixture", requestedProducts: ["availability"],
    excludedProducts: ["cross-section", "panel", "post-stratified"], claims: [], nonClaims: [], authority: "test",
    releaseAuthority: "none; all applicable scientific, privacy and custody gates remain required",
  }), "methodology");
  const productFile = await retain(`artifacts/publication/${product}.json`, "{}\n", "publication");
  const manifest = { schema: "hdri-public-manifest@1", kAnonymityMin: 12, policyDigest: "a".repeat(64), products: [{
    schema: "hdri-public-product@1", product, format: "json", schemaId: "fixture", contentSha256: sha("{}\n"), bytes: 3,
    policySha256: "a".repeat(64), sourceAggregateSha256: "b".repeat(64),
  }] };
  const manifestPath = await retain("artifacts/publication/public-manifest.json", JSON.stringify(manifest), "publication");
  const capsule: QuarterCapsule = { capsuleId: "fixture", period: "2026-q3", state: "candidate", instrumentPlan: [], artifacts };
  return { root, capsule, artifacts, productFile, manifestPath, retain };
}
test("publication closure binds manifest and exact listed bytes, without pretending to validate their scientific schema", async () => {
  const data = await fixture();
  const result = await verifyPublicationClosure(data.root, data.capsule, data.manifestPath);
  expect(result.requestedProducts).toEqual(["availability"]);
  expect(result.files).toBe(2);
});
test("excluded product cannot be released even when all its hashes match", async () => {
  const data = await fixture("cross-section");
  await expect(verifyPublicationClosure(data.root, data.capsule, data.manifestPath)).rejects.toThrow("SCOPE_OR_CONTRACT_INVALID");
});
test("availability release requires a quarter-bound v2 pair and rejects candidate descriptors", async () => {
  const data = await fixture();
  const capsule = { ...data.capsule, releaseProfile: "availability-only@1" as const };
  await expect(verifyPublicationClosure(data.root, capsule, data.manifestPath)).rejects.toThrow("MANIFEST_MISMATCH");
  const manifest = JSON.parse(await fs.readFile(data.manifestPath, "utf8"));
  manifest.period = capsule.period;
  manifest.capsuleId = capsule.capsuleId;
  manifest.products[0].schemaId = "hdri-public-availability@2";
  manifest.products.push({ ...manifest.products[0], format: "csv", contentSha256: sha("csv\n"), bytes: 4 });
  await data.retain("artifacts/publication/availability.csv", "csv\n", "publication");
  const rewrite = async () => {
    const index = data.artifacts.findIndex(a => a.uri === "artifacts/publication/public-manifest.json");
    data.artifacts.splice(index, 1);
    await data.retain("artifacts/publication/public-manifest.json", JSON.stringify(manifest), "publication");
  };
  await rewrite();
  expect((await verifyPublicationClosure(data.root, capsule, data.manifestPath)).files).toBe(3);
  manifest.status = "candidate-not-approved";
  await rewrite();
  await expect(verifyPublicationClosure(data.root, capsule, data.manifestPath)).rejects.toThrow("MANIFEST_MISMATCH");
  delete manifest.status;
  manifest.period = "2026-q4";
  await rewrite();
  await expect(verifyPublicationClosure(data.root, capsule, data.manifestPath)).rejects.toThrow("MANIFEST_MISMATCH");
});
test.each(["extra-file", "missing-manifest", "changed-product", "duplicate-artifact", "different-manifest"])(
  "publication closure fails on %s", async change => {
    const data = await fixture();
    if (change === "extra-file") await data.retain("artifacts/publication/private-domains.json", "[]", "publication");
    if (change === "missing-manifest") data.artifacts.pop();
    if (change === "changed-product") await fs.writeFile(data.productFile, "[]\n");
    if (change === "duplicate-artifact") data.artifacts.push(data.artifacts[1]!);
    if (change === "different-manifest") {
      const other = path.join(data.root, "other.json");
      await fs.writeFile(other, (await fs.readFile(data.manifestPath, "utf8")) + "\n"); data.manifestPath = other;
    }
    await expect(verifyPublicationClosure(data.root, data.capsule, data.manifestPath)).rejects.toThrow();
  },
);
