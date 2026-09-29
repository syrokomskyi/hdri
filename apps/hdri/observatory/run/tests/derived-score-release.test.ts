import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalize } from "@syrokomskyi/observatory-crypto";
import { stringify } from "csv-stringify/sync";
import { prepareDerivedScoreRelease } from "../release/derived-score-release";
import { verifyDerivedScoreEvidence } from "../release/derived-score-evidence";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-derived-release-")); roots.push(root);
  const sourceCapsuleDir = path.join(root, "source"), productDir = path.join(root, "products");
  await fs.mkdir(sourceCapsuleDir); await fs.mkdir(productDir);
  const capsuleId = "019ff219-69fe-7025-943c-dae2a8c37801";
  const source = { capsuleId, period: "2026-q3", state: "sealed", deviceId: "test", releaseProfile: "availability-only@1",
    instrumentPlan: ["liveness", "profile", "axe", "lighthouse"].map(instrument => ({ instrument, state: instrument === "liveness" ? "required" : "disabled", reason: "fixture" })),
    artifacts: [
      ["liveness", "artifacts/liveness.json"], ["frame", "artifacts/frame.json"], ["emit", "artifacts/emit.json"],
      ["methodology", "artifacts/methodology/publication-scope.yaml"],
      ["publication", "artifacts/publication/public-manifest.json"], ["publication", "artifacts/publication/availability.json"], ["publication", "artifacts/publication/availability.csv"],
      ["qc", "staging/targets/liveness.json"], ["qc", "staging/stage-seals/liveness.json"],
    ].map(([stage, uri]) => ({ stage, uri, sha256: hash("fixture"), bytes: 7 })),
  };
  const sourceBytes = JSON.stringify(source);
  const keypair = generateKeyPairSync("ed25519");
  const digest = createHash("sha256").update(canonicalize(source)).digest();
  const signature = { schemaVersion: 1, algorithm: "ed25519", manifestSha256: digest.toString("hex"), signingKeyId: "test", collectorId: "test", signedAt: "2026-09-28T00:00:00Z", signature: sign(null, digest, keypair.privateKey).toString("base64url") };
  await fs.writeFile(path.join(sourceCapsuleDir, "capsule-manifest.json"), sourceBytes);
  await fs.writeFile(path.join(sourceCapsuleDir, "capsule-signature.json"), JSON.stringify(signature));
  const summary = { n: 24, mean: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, min: 1, max: 1, stdDev: 0 };
  const rows = [{ section: "overview", ...summary }, { section: "confidence", ...summary }, { section: "maturity", id: "basis", label: "Basis", n: 24, share: 1 }];
  const columns = ["section", "id", "label", "bundesland", "gewerk", "n", "mean", "p10", "p25", "p50", "p75", "p90", "min", "max", "stdDev", "weight", "share"];
  const products = { json: JSON.stringify(rows), csv: stringify(rows, { header: true, columns }) };
  const manifest = { schema: "hdri-public-manifest@1", period: source.period, capsuleId, kAnonymityMin: 12, policyDigest: "a".repeat(64),
    products: Object.entries(products).map(([format, content]) => ({ schema: "hdri-public-product@1", product: "cross-section", format, schemaId: "hdri-dashboard-cross-section@1", contentSha256: hash(content), bytes: Buffer.byteLength(content), policySha256: "a".repeat(64), sourceAggregateSha256: "b".repeat(64) })) };
  for (const [format, content] of Object.entries(products)) await fs.writeFile(path.join(productDir, `cross-section.${format}`), content);
  await fs.writeFile(path.join(productDir, "public-manifest.json"), JSON.stringify(manifest));
  const publicationScopePath = path.join(root, "scope.yaml");
  await fs.writeFile(publicationScopePath, JSON.stringify({ schema: "hdri-publication-intent@1", period: source.period, capsuleId, requestedProducts: ["cross-section"], excludedProducts: ["availability", "panel", "post-stratified"], claims: [], nonClaims: [], authority: "test", releaseAuthority: "none; all applicable scientific, privacy and custody gates remain required" }));
  return { root, sourceBytes, manifest, input: { sourceCapsuleDir, sourceManifestSha256: hash(sourceBytes), verificationKey: { signingKeyId: "test", publicKeyPem: keypair.publicKey.export({ type: "spki", format: "pem" }).toString() }, productDir, publicationScopePath, outputParent: root } };
}

test("a new score candidate can reference an availability source without changing it or inheriting admission", async () => {
  const f = await fixture();
  const result = await prepareDerivedScoreRelease(f.input);
  expect(result.candidate.source.manifestSha256).toBe(f.input.sourceManifestSha256);
  expect(result.candidate.releaseId).not.toBe(result.candidate.source.capsuleId);
  expect(result.candidate.requestedProducts).toEqual(["cross-section"]);
  expect(result.candidate.requiredScientificReports).toContain("classification-qc.json");
  expect(result.candidate.remainingRequirements).toContain("operational-admission");
  expect(await fs.readFile(path.join(f.input.sourceCapsuleDir, "capsule-manifest.json"), "utf8")).toBe(f.sourceBytes);
  expect(await fs.readdir(f.input.sourceCapsuleDir)).toEqual(["capsule-manifest.json", "capsule-signature.json"]);
});

test.each(["pin", "signature", "period", "bytes", "csv", "inside-source"])("rejects %s without creating a publication", async change => {
  const f = await fixture();
  if (change === "pin") f.input.sourceManifestSha256 = "0".repeat(64);
  if (change === "signature") await fs.writeFile(path.join(f.input.sourceCapsuleDir, "capsule-signature.json"), "{}");
  if (change === "period") { f.manifest.period = "2026-q4"; await fs.writeFile(path.join(f.input.productDir, "public-manifest.json"), JSON.stringify(f.manifest)); }
  if (change === "bytes") await fs.appendFile(path.join(f.input.productDir, "cross-section.json"), " ");
  if (change === "csv") await fs.writeFile(path.join(f.input.productDir, "cross-section.csv"), "section,n\noverview,12\n");
  if (change === "inside-source") f.input.outputParent = f.input.sourceCapsuleDir;
  await expect(prepareDerivedScoreRelease(f.input)).rejects.toThrow();
  expect(await fs.readFile(path.join(f.input.sourceCapsuleDir, "capsule-manifest.json"), "utf8")).toBe(f.sourceBytes);
});

test("a prepared candidate cannot inherit scientific approval from its source", async () => {
  const f = await fixture();
  const {directory} = await prepareDerivedScoreRelease(f.input);
  const bytes = await fs.readFile(path.join(directory, "derived-score-candidate.json"), "utf8");
  await expect(verifyDerivedScoreEvidence(directory, "0".repeat(64), f.input.verificationKey)).rejects.toThrow("PIN_MISMATCH");
  await expect(verifyDerivedScoreEvidence(directory, hash(bytes), f.input.verificationKey)).rejects.toThrow();
  await fs.writeFile(path.join(directory, "derived-evidence-inventory.json"), JSON.stringify({schema: "hdri-derived-evidence-inventory@1", source: JSON.parse(bytes).source, artifacts: []}));
  await expect(verifyDerivedScoreEvidence(directory, hash(bytes), f.input.verificationKey)).rejects.toThrow("REPORT_INVENTORY_INCOMPLETE");
});
