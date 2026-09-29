import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import type { CapsuleArtifact, QuarterCapsule } from "@syrokomskyi/factory-core";
import { deriveAvailabilityRebuildReceipt, verifyAvailabilityRebuildReceipt } from "../release/availability-rebuild";
import { verifyAvailabilityMethodology } from "../release/availability-methodology";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-replay-binding-")); roots.push(root);
  const scope = { period: "2026-q3", capsuleId: "019c0000-0000-7000-8000-000000000001", deviceId: "test" };
  const artifacts: CapsuleArtifact[] = [];
  async function retain(uri: string, bytes: string, stage: CapsuleArtifact["stage"] = "methodology") {
    const target = path.join(root, uri); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
    const existing = artifacts.findIndex(a => a.uri === uri); if (existing >= 0) artifacts.splice(existing, 1);
    artifacts.push({ uri, stage, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
    return target;
  }
  const policy = "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n";
  const policyPath = await retain("artifacts/methodology/k-anon-policy-v1.yaml", policy);
  const candidate = json({ schema: "hdri-availability-candidate@1", status: "candidate-not-approved", ...scope,
    denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1", effectiveK: 12, policySha256: hash(policy),
    n: 100, counts: { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 }, reachableShareOfTargets: 0.4,
    source: { targetSetSha256: "a".repeat(64), selectedResultSetSha256: "b".repeat(64) } });
  const comparison = json({ schema: "hdri-availability-reconciliation@1", status: "projection-matched-not-release-proof", ...scope,
    targets: 100, observationsCompared: 200, bundleObservationsScanned: 300, counts: JSON.parse(candidate).counts,
    targetSetSha256: "a".repeat(64), selectedResultSetSha256: "b".repeat(64), bundleHash: "c".repeat(64) });
  await retain("artifacts/qc/availability/candidate.json", candidate, "qc");
  await retain("artifacts/qc/availability/comparison.json", comparison, "qc");
  const candidatePath = path.join(root, `${hash(candidate)}.json`), comparisonPath = path.join(root, `${hash(comparison)}.json`);
  await fs.writeFile(candidatePath, candidate); await fs.writeFile(comparisonPath, comparison);
  const cli = async (name: string, args: string[]) => JSON.parse((await promisify(execFile)(process.execPath,
    ["--conditions=@syrokomskyi/source", "--import", import.meta.resolve("tsx"),
      fileURLToPath(new URL(`../../tools/${name}`, import.meta.url)), ...args], { cwd: root })).stdout);
  const preview = await cli("prepare-availability-preview.ts", ["--candidate", candidatePath, "--reconciliation", comparisonPath, "--policy", policyPath]);
  const disclosure = await cli("review-availability-preview.ts", ["--preview-dir", preview.outputDir, "--period", scope.period, "--policy", policyPath]);
  const products = [];
  for (const format of ["json", "csv"]) {
    const bytes = await fs.readFile(path.join(preview.outputDir, `availability.${format}`), "utf8");
    await retain(`artifacts/publication/availability.${format}`, bytes, "publication");
    products.push({ schema: "hdri-public-product@1", product: "availability", format, contentSha256: hash(bytes),
      bytes: Buffer.byteLength(bytes), policySha256: hash(policy), schemaId: "hdri-public-availability@2", sourceAggregateSha256: hash(candidate) });
  }
  await retain("artifacts/publication/public-manifest.json", json({ schema: "hdri-public-manifest@1", period: scope.period,
    capsuleId: scope.capsuleId, products, policyDigest: hash(policy), kAnonymityMin: 12 }), "publication");
  await retain("artifacts/methodology/publication-scope.yaml", json({ schema: "hdri-publication-intent@1", period: scope.period,
    capsuleId: scope.capsuleId, requestedProducts: ["availability"], excludedProducts: ["cross-section", "panel", "post-stratified"],
    claims: [], nonClaims: [], authority: "test", releaseAuthority: "none; all applicable scientific, privacy and custody gates remain required" }));
  const prefix = "artifacts/methodology/offline-runtime/";
  const names = ["runtime/build-metafile.json", "runtime/node24-alpine-image.tar", "runtime/prepare-availability.mjs",
    "runtime/reconcile-availability.mjs", "runtime/prepare-availability-preview.mjs", "runtime/review-availability-preview.mjs",
    ...["availability-candidate", "availability-reconciliation", "availability-preview", "availability-disclosure"].map(n => `source/apps/hdri/observatory/run/release/${n}.ts`),
    "source/packages/observatory/observatory-core/src/availability.ts"];
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function runtimeFile(name: string, bytes: string) {
    await retain(prefix + name, bytes); files.push({ path: name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
  }
  for (const name of names) await runtimeFile(name, `synthetic-nonexecutable:${name}`);
  await runtimeFile("policies/k-anon-policy-v1.yaml", policy);
  for (const [name, result] of Object.entries({ candidate: { sha256: hash(candidate) }, reconciliation: { sha256: hash(comparison) }, preview, disclosure }))
    await runtimeFile(`evidence/${name}-command.json`, json(result));
  const commands = {
    prepare: ["node", "/runtime/prepare-availability.mjs", "--capsule-dir", "/capsule", "--keys-dir", "/keys"],
    reconcile: ["node", "/runtime/reconcile-availability.mjs", "--capsule-dir", "/capsule", "--keys-dir", "/keys"],
    preview: ["node", "/runtime/prepare-availability-preview.mjs", "--candidate", `/work/.output/availability-candidates/${scope.period}/${scope.capsuleId}/${hash(candidate)}.json`,
      "--reconciliation", `/work/.output/availability-reconciliation/${scope.period}/${scope.capsuleId}/${hash(comparison)}.json`, "--policy", "/work/policies/k-anon-policy-v1.yaml"],
    disclosure: ["node", "/runtime/review-availability-preview.mjs", "--preview-dir", `/work/.output/availability-previews/${preview.manifestSha256}`,
      "--period", scope.period, "--policy", "/work/policies/k-anon-policy-v1.yaml"],
  };
  // Synthetic records test consumption, not actual container execution or admission.
  const runtime = { schema: "hdri-offline-runtime-kit@1", ...scope, image: `sha256:${"d".repeat(64)}`, files,
    containers: Object.entries(commands).map(([stage, command]) => ({ stage, command, image: `sha256:${"d".repeat(64)}`,
      network: "none", readonlyRootfs: true, capDrop: ["ALL"], securityOpt: ["no-new-privileges"],
      state: { Status: "exited", ExitCode: 0, OOMKilled: false, Error: "", StartedAt: "2026-09-01T00:00:00Z", FinishedAt: "2026-09-01T00:01:00Z" },
      mounts: ["/work", "/work/policies", "/runtime", "/capsule", "/keys"].map(destination => ({ destination, writable: destination === "/work" })) })) };
  const save = () => retain(prefix + "runtime-kit-manifest.json", json(runtime)); await save();
  const methodology = await verifyAvailabilityMethodology({ manifestPath: path.join(root, prefix, "runtime-kit-manifest.json"),
    expectedManifestSha256: hash(json(runtime)), policySha256: hash(policy), period: scope.period, capsuleId: scope.capsuleId });
  await retain("artifacts/qc/release/methodology-snapshot.json", json({ status: "pass", ...scope, ...methodology }), "qc");
  const capsule: QuarterCapsule = { ...scope, state: "candidate", releaseProfile: "availability-only@1", instrumentPlan: [], artifacts };
  return { root, capsule, runtime, retain, save: async () => {
    await save();
    await retain("artifacts/qc/release/methodology-snapshot.json", json({ status: "pass", ...scope, ...methodology,
      runtimeManifestSha256: hash(json(runtime)) }), "qc");
  } };
}

test("reuses retained replay under a distinct receipt and rejects tampered receipts and public bytes", async () => {
  const f = await fixture();
  const result = await deriveAvailabilityRebuildReceipt(f.root, f.capsule);
  expect(result.schema).toBe("hdri-availability-rebuild@1");
  expect(result.verificationMode).toBe("retained-offline-data-replay-with-current-descriptor-reconstruction");
  expect(result.startedAt).toBe("2026-09-01T00:00:00Z");
  await expect(verifyAvailabilityRebuildReceipt(f.root, f.capsule, result)).resolves.toBeUndefined();
  await expect(verifyAvailabilityRebuildReceipt(f.root, f.capsule, { ...result, runtimeClosureSha256: "e".repeat(64) })).rejects.toThrow("RECEIPT_MISMATCH");
  await f.retain("artifacts/publication/availability.csv", "substituted\n", "publication");
  await expect(deriveAvailabilityRebuildReceipt(f.root, f.capsule)).rejects.toThrow("PUBLIC_BYTES_MISMATCH");
});
test.each(["network", "mount", "exit", "command", "missing-stage", "changed-runtime"])("rejects %s replay evidence", async change => {
  const f = await fixture();
  if (change === "network") f.runtime.containers[0]!.network = "bridge";
  if (change === "mount") f.runtime.containers[0]!.mounts[1]!.writable = true;
  if (change === "exit") f.runtime.containers[0]!.state.ExitCode = 1;
  if (change === "command") f.runtime.containers[0]!.command[1] = "/runtime/other.mjs";
  if (change === "missing-stage") f.runtime.containers.pop();
  if (change === "changed-runtime") await fs.appendFile(path.join(f.root, "artifacts/methodology/offline-runtime/runtime/prepare-availability.mjs"), " ");
  await f.save();
  await expect(deriveAvailabilityRebuildReceipt(f.root, f.capsule)).rejects.toThrow();
});
