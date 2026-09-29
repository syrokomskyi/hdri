import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { verifyRetainedAvailabilityReconciliation } from "../release/retained-availability-reconciliation";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-retained-comparison-"));
  roots.push(root);
  const write = async (name: string, value: unknown) => {
    const bytes = typeof value === "string" ? value : JSON.stringify(value);
    const file = path.join(root, name);
    await fs.writeFile(file, bytes);
    return { path: file, sha256: digest(bytes) };
  };
  const scope = { period: "2026-q3", capsuleId: "019c0000-0000-7000-8000-000000000001" };
  const policy = await write("policy.yaml", "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n");
  const counts = { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 };
  const candidate = {
    schema: "hdri-availability-candidate@1", status: "candidate-not-approved", ...scope,
    deviceId: "test-device", denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1",
    effectiveK: 12, policySha256: policy.sha256, n: 100, counts, reachableShareOfTargets: 0.4,
    source: { targetSetSha256: "a".repeat(64), selectedResultSetSha256: "b".repeat(64) },
  };
  const comparison = {
    schema: "hdri-availability-reconciliation@1", status: "projection-matched-not-release-proof",
    ...scope, deviceId: "test-device", targets: 100, observationsCompared: 200,
    bundleObservationsScanned: 300, counts, ...candidate.source, bundleHash: "c".repeat(64),
  };
  const bundle = { period: scope.period, run_id: scope.capsuleId, bundle_hash: comparison.bundleHash,
    observation_count: 300, asset_state_count: 100,
    observation_partitions: [{ uri: "observations/part-000000.ndjson", row_count: 300, sha256: "d".repeat(64) }] };
  return { root, write, candidate, comparison, bundle, input: { ...scope, policy,
    candidate: await write("candidate.json", candidate), comparison: await write("comparison.json", comparison),
    bundleManifest: await write("manifest.json", bundle) } };
}

test("audits a pinned completed comparison without claiming reexecution or broader applicability", async () => {
  const { input } = await fixture();
  const result = await verifyRetainedAvailabilityReconciliation(input);
  expect(result.applicability).toEqual(["availability"]);
  expect(result.verificationMode).toBe("pinned-completed-comparison-not-reexecution");
  expect(result.targets).toBe(100);
  expect(result.observationsCompared).toBe(200);
  expect(result.bundleObservationsScanned).toBe(300);
  expect(result.bindings.comparisonSha256).toBe(input.comparison.sha256);
});

test.each(["candidate", "comparison", "bundleManifest", "policy"] as const)("rejects changed %s bytes under the old pin", async key => {
  const { input } = await fixture();
  await fs.appendFile(input[key].path, " ");
  await expect(verifyRetainedAvailabilityReconciliation(input)).rejects.toThrow("DIGEST_MISMATCH");
});

test("even pinned records must agree on period and every outcome", async () => {
  const { input, write, comparison } = await fixture();
  await expect(verifyRetainedAvailabilityReconciliation({ ...input, period: "2026-q4" })).rejects.toThrow("SCOPE_MISMATCH");
  input.comparison = await write("comparison.json", { ...comparison,
    counts: { reachable: 30, unavailable: 40, blocked: 15, indeterminate: 15 } });
  await expect(verifyRetainedAvailabilityReconciliation(input)).rejects.toThrow("RECONCILIATION_MISMATCH");
});

test("rejects a substituted bundle and incomplete or duplicate partition accounting", async () => {
  const { input, bundle, write } = await fixture();
  input.bundleManifest = await write("manifest.json", { ...bundle, bundle_hash: "e".repeat(64) });
  await expect(verifyRetainedAvailabilityReconciliation(input)).rejects.toThrow("BUNDLE_OR_SCOPE_MISMATCH");
  input.bundleManifest = await write("manifest.json", { ...bundle,
    observation_partitions: [{ ...bundle.observation_partitions[0], row_count: 200 }] });
  await expect(verifyRetainedAvailabilityReconciliation(input)).rejects.toThrow("PARTITION_COUNT_MISMATCH");
  input.bundleManifest = await write("manifest.json", { ...bundle,
    observation_partitions: [bundle.observation_partitions[0], bundle.observation_partitions[0]] });
  await expect(verifyRetainedAvailabilityReconciliation(input)).rejects.toThrow("PARTITIONS_INVALID");
});

test("rejects symlinks and missing explicit pins", async () => {
  const { input, root } = await fixture();
  await expect(verifyRetainedAvailabilityReconciliation({ ...input, comparison: { ...input.comparison, sha256: "" } })).rejects.toThrow("PIN_INVALID");
  const alias = path.join(root, "alias.json");
  await fs.symlink(input.comparison.path, alias);
  await expect(verifyRetainedAvailabilityReconciliation({ ...input, comparison: { ...input.comparison, path: alias } })).rejects.toThrow();
});

test("CLI retains a deterministic availability-only report and refuses changed evidence", async () => {
  const { input, root } = await fixture();
  const pairs = [["candidate", input.candidate], ["comparison", input.comparison],
    ["bundle-manifest", input.bundleManifest], ["policy", input.policy]] as const;
  const run = () => promisify(execFile)(process.execPath, ["--conditions=@syrokomskyi/source", "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../../tools/scientific-reports/availability-reconciliation.ts", import.meta.url)),
    "--period", input.period, "--capsule-id", input.capsuleId, "--evidence-dir", path.join(root, "reports"),
    ...pairs.flatMap(([name, file]) => [`--${name}`, file.path, `--${name}-sha256`, file.sha256])]);
  const first = JSON.parse((await run()).stdout);
  expect(first.status).toBe("pass");
  expect(first.reportType).toBe("reconciliation");
  expect(first.applicability).toEqual(["availability"]);
  expect(JSON.parse((await run()).stdout)).toEqual(first);
  await fs.appendFile(input.comparison.path, " ");
  await expect(run()).rejects.toThrow();
  expect(JSON.parse(await fs.readFile(path.join(root, "reports", "reconciliation.json"), "utf8"))).toEqual(first);
});
