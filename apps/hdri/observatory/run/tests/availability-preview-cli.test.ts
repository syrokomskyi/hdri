import { afterEach, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serializeReconciledAvailabilityPreview } from "../release/availability-preview";

const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const policy = "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n";
const scope = { period: "2026-q3", capsuleId: "fixture-capsule", deviceId: "fixture-device" };
function inputs() {
  const counts = { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 };
  const source = { targetSetSha256: "a".repeat(64), selectedResultSetSha256: "b".repeat(64) };
  return {
    candidate: { schema: "hdri-availability-candidate@1", status: "candidate-not-approved", ...scope,
      denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1", effectiveK: 12,
      n: 100, counts, reachableShareOfTargets: 0.4, source, policySha256: sha(policy) },
    report: { schema: "hdri-availability-reconciliation@1", status: "projection-matched-not-release-proof", ...scope,
      targets: 100, observationsCompared: 200, bundleObservationsScanned: 300, counts, ...source, bundleHash: "c".repeat(64) },
  };
}

test.each([{ period: "2026-q2" }, { capsuleId: "other" }, { deviceId: "other" }, { targets: 99 },
  { observationsCompared: 198 }, { bundleObservationsScanned: 199 }, { targetSetSha256: "d".repeat(64) },
  { selectedResultSetSha256: "e".repeat(64) }, { status: "pass" },
  { counts: { reachable: 30, unavailable: 40, blocked: 15, indeterminate: 15 } }])(
  "report mismatch rejects the preview: %j", changes => {
    const { candidate, report } = inputs();
    expect(() => serializeReconciledAvailabilityPreview(candidate, { ...report, ...changes }, 12, sha(policy))).toThrow("RECONCILIATION_MISMATCH");
  },
);
test("same threshold with different policy bytes is not the retained policy", () => {
  const { candidate, report } = inputs();
  expect(() => serializeReconciledAvailabilityPreview(candidate, report, 12, "f".repeat(64))).toThrow("POLICY_DIGEST_MISMATCH");
});

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const cli = path.resolve("tools/prepare-availability-preview.ts");
const disclosureCli = path.resolve("tools/review-availability-preview.ts");
const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
test("actual CLI creates private reproducible bytes, retries identically and rejects substituted input", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-preview-cli-")); roots.push(root);
  const { candidate, report } = inputs();
  const candidateBytes = JSON.stringify(candidate);
  const reportBytes = JSON.stringify(report);
  const candidatePath = path.join(root, `${sha(candidateBytes)}.json`);
  const reportPath = path.join(root, `${sha(reportBytes)}.json`);
  const policyPath = path.join(root, "policy.yaml");
  await fs.writeFile(candidatePath, candidateBytes);
  await fs.writeFile(reportPath, reportBytes);
  await fs.writeFile(policyPath, policy);
  const run = () => JSON.parse(execFileSync(process.execPath, [tsx, "-C", "@syrokomskyi/source", cli,
    "--candidate", candidatePath, "--reconciliation", reportPath, "--policy", policyPath],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const first = run();
  expect(first.status).toBe("preview-not-approved");
  expect(run()).toEqual(first);
  const csv = await fs.readFile(path.join(first.outputDir, "availability.csv"), "utf8");
  expect(csv).toContain("2026-q3,100,40,30,15,15,0.4\n");
  expect((await fs.stat(path.join(first.outputDir, "availability.csv"))).mode & 0o777).toBe(0o600);
  const manifestBytes = await fs.readFile(path.join(first.outputDir, "preview-manifest.json"), "utf8");
  expect(sha(manifestBytes)).toBe(first.manifestSha256);
  const review = () => JSON.parse(execFileSync(process.execPath, [tsx, "-C", "@syrokomskyi/source", disclosureCli,
    "--preview-dir", first.outputDir, "--period", "2026-q3", "--policy", policyPath],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const reviewed = review();
  expect(reviewed.status).toBe("single-product-checked-not-release-admission");
  expect(review()).toEqual(reviewed);
  await fs.writeFile(path.join(first.outputDir, "availability.csv"), csv.replace(",40,30,", ",30,40,"));
  expect(review).toThrow();
  await fs.writeFile(candidatePath, `${candidateBytes} `);
  expect(run).toThrow();
});
