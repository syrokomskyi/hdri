/*
<MODULE_CONTRACT>
<purpose>Independently validates a fully assembled HDRI release candidate by reading a ReleaseInput manifest, verifying scientific reports and rebuild receipt, and writing a QuarterValidationReport.</purpose>
<non-goals><item>Does not seal, replicate or publish anything.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: write validation-report.json to capsule artifacts/qc/release/ directory.</item>
  <item>RFC-0109: replace --candidate/--evidence-dir with --release-input manifest. Validate scientific reports with inputFingerprint. No preliminary/final distinction — one immutable verification per input. Output JSON with releaseId, scientificReportsVerified, rebuildMatch.</item>
  <item>RFC-0110: update RebuildReceipt validation for hdri-independent-rebuild@1 schema. Check schema field, hash match, and verifyRebuildReceipt.</item>
  <item>RFC-0115: bind reports to retained scope and the explicit Q3 classification decision; preserve every other validation requirement.</item>
  <item>RFC-0115: pre-seal validation binds reconstruction to predicted final manifest bytes; availability-only validation independently rederives retained replay receipts.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyPublicationClosure } from "../run/release/publication-closure";
import { expectedSealedManifestSha256 } from "../run/release/sealed-manifest-digest";
import { verifyAvailabilityRebuildReceipt } from "../run/release/availability-rebuild";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { verifyQuarterCapsuleArtifacts } from "@syrokomskyi/factory-core";
import {
  readScientificReports,
  sha256File,
  verifyRebuildReceiptBinding,
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
if (sealedCapsule.state !== "candidate" && sealedCapsule.state !== "sealed")
  throw new Error("Quarter validation requires a candidate or sealed capsule");
await verifyQuarterCapsuleArtifacts(capsuleDir, sealedCapsule);
// Pre-seal validation predicts the final writer's bytes without writing or signing them.
// Once sealed, the actual file digest remains authoritative (also checked by release).
const measurementCapsuleSha256 = sealedCapsule.state === "candidate"
  ? expectedSealedManifestSha256(sealedCapsule) : await sha256File(capsuleManifestPath);

const { requestedProducts, publicManifestSha256 } = await verifyPublicationClosure(capsuleDir, sealedCapsule, path.resolve(releaseInput.publicManifestPath));
const reports = await readScientificReports(evidenceDir, sealedCapsule, requestedProducts, capsuleDir);

let rebuildMatch = false;
try {
  const rebuild = JSON.parse(await fs.readFile(rebuildReceiptPath, "utf8")) as RebuildReceipt;
  if (sealedCapsule.releaseProfile === "availability-only@1")
    await verifyAvailabilityRebuildReceipt(capsuleDir, sealedCapsule, rebuild);
  else if (rebuild.schema !== "hdri-independent-rebuild@1") throw new Error("Rebuild profile mismatch");
  const violations = verifyRebuildReceiptBinding(rebuild, measurementCapsuleSha256, publicManifestSha256);
  rebuildMatch = violations.length === 0;
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
      measurementCapsuleSha256,
      scientificInputSha256: candidateManifestSha256,
    }),
  )
  .digest("hex");

const validationPath = path.join(capsuleDir, "artifacts", "qc", "release", "validation-report.json");
let checkedAt = new Date().toISOString();
try {
  const retained = JSON.parse(await fs.readFile(validationPath, "utf8")) as QuarterValidationReport;
  if (retained.envelopeSha256 === envelopeSha256 && typeof retained.checkedAt === "string" && Number.isFinite(Date.parse(retained.checkedAt)))
    checkedAt = retained.checkedAt;
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const report: QuarterValidationReport = {
  schemaVersion: "1",
  period: sealedCapsule.period,
  capsuleId: sealedCapsule.capsuleId,
  envelopeSha256,
  status: "pass",
  checkedAt,
  scientificReports: reports.map((r) => r.reportType),
  rebuildMatch,
  replicasVerified: 0,
  mediaVerified: 0,
  violations: [],
  warnings: [],
  hardSuppressions: [],
};

await fs.mkdir(path.dirname(validationPath), { recursive: true, mode: 0o700 });
const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
try { await fs.writeFile(validationPath, reportBytes, { flag: "wx", mode: 0o600 }); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  if (await fs.readFile(validationPath, "utf8") !== reportBytes) throw new Error("QUARTER_VALIDATION_RETAINED_REPORT_CONFLICT");
}

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
