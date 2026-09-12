/*
<MODULE_CONTRACT>
<purpose>Independently validates a fully assembled HDRI release candidate by reading a ReleaseInput manifest, verifying scientific reports and rebuild receipt, and writing a QuarterValidationReport.</purpose>
<non-goals><item>Does not seal, replicate or publish anything.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: write validation-report.json to capsule artifacts/qc/release/ directory.</item>
  <item>RFC-0109: replace --candidate/--evidence-dir with --release-input manifest. Validate scientific reports with inputFingerprint. No preliminary/final distinction — one immutable verification per input. Output JSON with releaseId, scientificReportsVerified, rebuildMatch.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { verifyQuarterCapsuleArtifacts } from "@syrokomskyi/factory-core";
import {
  readScientificReports,
  sha256File,
  type QuarterValidationReport,
  type RebuildReceipt,
  type ReleaseInput,
} from "../run/release/release-contract";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const releaseInputPath = arg("--release-input");
if (!releaseInputPath) throw new Error("--release-input <manifest> is required");

const releaseInput = JSON.parse(
  await fs.readFile(path.resolve(releaseInputPath), "utf8"),
) as ReleaseInput;

if (releaseInput.schema !== "hdri-release-input@1") {
  throw new Error("Release input manifest has wrong schema");
}

const capsuleManifestPath = path.resolve(releaseInput.capsuleManifestPath);
const capsuleDir = path.dirname(capsuleManifestPath);
const evidenceDir = path.resolve(releaseInput.evidenceDir);
const rebuildReceiptPath = path.resolve(releaseInput.rebuildReceiptPath);

const sealedCapsule = JSON.parse(await fs.readFile(capsuleManifestPath, "utf8")) as QuarterCapsule;
await verifyQuarterCapsuleArtifacts(capsuleDir, sealedCapsule);

const reports = await readScientificReports(evidenceDir, sealedCapsule);

let rebuildMatch = false;
try {
  const rebuild = JSON.parse(await fs.readFile(rebuildReceiptPath, "utf8")) as RebuildReceipt;
  rebuildMatch =
    rebuild.schemaVersion === "1" &&
    rebuild.period === sealedCapsule.period &&
    rebuild.capsuleId === sealedCapsule.capsuleId &&
    rebuild.matched === true;
} catch {
  rebuildMatch = false;
}

if (!rebuildMatch) {
  throw new Error("Rebuild receipt missing or invalid — cannot validate release");
}

const candidateManifestSha256 = await sha256File(path.join(capsuleDir, "capsule-candidate.json"));
const envelopeSha256 = createHash("sha256")
  .update(
    JSON.stringify({
      releaseId: sealedCapsule.capsuleId,
      period: sealedCapsule.period,
      measurementCapsuleSha256: await sha256File(capsuleManifestPath),
      scientificInputSha256: candidateManifestSha256,
    }),
  )
  .digest("hex");

const report: QuarterValidationReport = {
  schemaVersion: "1",
  period: sealedCapsule.period,
  capsuleId: sealedCapsule.capsuleId,
  envelopeSha256,
  status: "pass",
  checkedAt: new Date().toISOString(),
  scientificReports: reports.map((r) => r.reportType),
  rebuildMatch,
  replicasVerified: 0,
  mediaVerified: 0,
  violations: [],
  warnings: [],
  hardSuppressions: [],
};

const validationPath = path.join(
  capsuleDir,
  "artifacts",
  "qc",
  "release",
  "validation-report.json",
);
await fs.mkdir(path.dirname(validationPath), { recursive: true });
await fs.writeFile(validationPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      command: "hdri.quarter.validate",
      status: "pass",
      releaseId: sealedCapsule.capsuleId,
      scientificReportsVerified: reports.length,
      rebuildMatch,
    },
    null,
    2,
  )}\n`,
);
