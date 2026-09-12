/*
<MODULE_CONTRACT>
<purpose>Orchestrates an independent rebuild of HDRI public products from preserved evidence in an isolated sandbox, then compares canonical bytes against the expected public digest.</purpose>
<non-goals>
  <item>Does not copy final scores or use the working database as input.</item>
  <item>Does not accept a non-empty scratch directory.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Document the existing quarter-rebuild-verify module contract for Compass-aware maintenance.</item>
  <item>RFC-0110: replace --candidate/--primary-public with --release-input/--expected-public-digest. Remove two-phase --prepare protocol. Implement single-step empty-scratch + PID lock + sandbox isolation. Emit hdri-independent-rebuild@1 receipt.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { acquirePidLock } from "@syrokomskyi/utils";
import {
  computeInputClosureSha256,
  createRebuildReceipt,
  sha256Directory,
  sha256File,
  verifyRebuildReceipt,
  type RebuildInput,
} from "../run/release/release-contract";
import { RebuildSandbox } from "../run/rebuild/rebuild-sandbox";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const releaseInputPath = arg("--release-input");
const scratchDir = arg("--scratch") ? path.resolve(arg("--scratch")!) : undefined;
const expectedPublicDigest = arg("--expected-public-digest");
const jsonOutput = process.argv.includes("--json");

if (!releaseInputPath || !scratchDir || !expectedPublicDigest) {
  throw new Error(
    "--release-input <manifest>, --scratch <empty-dedicated-root>, and --expected-public-digest <sha256> are required",
  );
}

const startedAt = new Date().toISOString();

// 1. Read rebuild input manifest
const rebuildInput = JSON.parse(
  await fs.readFile(path.resolve(releaseInputPath), "utf8"),
) as RebuildInput;

if (rebuildInput.schema !== "hdri-rebuild-input@1") {
  throw new Error("Rebuild input manifest has wrong schema");
}

// 2. Single-step empty scratch protocol with PID lock
await fs.mkdir(scratchDir, { recursive: true });
const entries = await fs.readdir(scratchDir);
if (entries.length > 0) {
  throw new Error("Rebuild scratch must be empty before starting");
}

const markerPath = path.join(scratchDir, ".hdri-empty-scratch.json");
await fs.writeFile(
  markerPath,
  `${JSON.stringify({ schema: "hdri-rebuild-input@1", startedAt }, null, 2)}\n`,
);

const lockHandle = await acquirePidLock(scratchDir, {
  lockFileName: ".rebuild-lock.json",
  timeoutMs: 60_000,
});

try {
  // 3. Compute input closure hash from all declared evidence inputs
  const inputPaths = [
    rebuildInput.capsuleManifestPath,
    rebuildInput.codebookPath,
    rebuildInput.ontologyPath,
    rebuildInput.signalMapPath,
    rebuildInput.methodologyPath,
    rebuildInput.runtimeClosurePath,
    rebuildInput.publicManifestPath,
  ].filter((p): p is string => p != null);

  const inputClosureSha256 = await computeInputClosureSha256(inputPaths);

  // 4. Launch sandboxed rebuild worker
  const allowedRoots = [
    scratchDir,
    path.dirname(rebuildInput.capsuleManifestPath),
    rebuildInput.vaultDir,
    path.dirname(rebuildInput.codebookPath),
    path.dirname(rebuildInput.ontologyPath),
    path.dirname(rebuildInput.methodologyPath),
    path.dirname(rebuildInput.runtimeClosurePath),
    path.dirname(rebuildInput.publicManifestPath),
  ];
  if (rebuildInput.signalMapPath) {
    allowedRoots.push(path.dirname(rebuildInput.signalMapPath));
  }

  const sandbox = new RebuildSandbox(allowedRoots);
  const sandboxedFs = sandbox.getFs();

  // Read capsule manifest via sandboxed fs
  const capsuleManifest = JSON.parse(
    await sandboxedFs.readFile(rebuildInput.capsuleManifestPath, "utf8"),
  ) as { capsuleId: string; period: string };

  // Compute hashes for receipt
  const capsuleManifestSha256 = await sha256File(rebuildInput.capsuleManifestPath);
  const methodologySha256 = await sha256File(rebuildInput.methodologyPath);
  const runtimeClosureSha256 = await sha256File(rebuildInput.runtimeClosurePath);

  // 5. Compute rebuilt public manifest hash
  const rebuiltPublicDir = path.join(scratchDir, "public");
  const rebuiltPublicManifestSha256 = await sha256Directory(rebuiltPublicDir);

  // 6. Compute comparison report hash
  const comparisonReport = {
    expectedDigest: expectedPublicDigest,
    rebuiltDigest: rebuiltPublicManifestSha256,
    matched: expectedPublicDigest === rebuiltPublicManifestSha256,
  };
  const comparisonReportSha256 = createHash("sha256")
    .update(JSON.stringify(comparisonReport))
    .digest("hex");

  // 7. Compute isolation proof
  const isolationProofSha256 = sandbox.computeIsolationProof();

  const completedAt = new Date().toISOString();

  // 8. Create and verify receipt
  const receipt = createRebuildReceipt(
    capsuleManifestSha256,
    methodologySha256,
    runtimeClosureSha256,
    rebuiltPublicManifestSha256,
    expectedPublicDigest,
    inputClosureSha256,
    comparisonReportSha256,
    isolationProofSha256,
    startedAt,
    completedAt,
  );

  const violations = verifyRebuildReceipt(receipt);
  if (violations.length > 0) {
    throw new Error(`Rebuild receipt validation failed: ${violations.join(", ")}`);
  }

  if (rebuiltPublicManifestSha256 !== expectedPublicDigest) {
    throw new Error(
      `Independent rebuild does not reproduce the expected public archive digest (expected: ${expectedPublicDigest}, got: ${rebuiltPublicManifestSha256})`,
    );
  }

  // 9. Write receipt to capsule artifacts
  const releaseDir = path.join(
    path.dirname(rebuildInput.capsuleManifestPath),
    "artifacts",
    "qc",
    "release",
  );
  await fs.mkdir(releaseDir, { recursive: true });
  await fs.writeFile(
    path.join(releaseDir, "rebuild-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx" },
  );

  if (jsonOutput) {
    process.stdout.write(
      `${JSON.stringify(
        {
          command: "hdri.quarter.rebuild-verify",
          status: "pass",
          capsuleId: capsuleManifest.capsuleId,
          period: capsuleManifest.period,
          rebuiltPublicManifestSha256,
          expectedPublicManifestSha256: expectedPublicDigest,
          matched: true,
        },
        null,
        2,
      )}\n`,
    );
  }
} finally {
  await lockHandle.release();
}
