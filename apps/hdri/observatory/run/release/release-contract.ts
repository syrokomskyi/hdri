/*
<MODULE_CONTRACT>
<purpose>Defines fail-closed scientific, rebuild and replica evidence required before an HDRI quarter can be sealed.</purpose>
<non-goals><item>Does not collect sites, calculate scores or waive a failed gate.</item></non-goals>
</MODULE_CONTRACT>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { CapsuleArtifact, QuarterCapsule } from "@syrokomskyi/factory-core";

export const SCIENTIFIC_REPORTS = {
  "q2-restore.json": "q2-restore",
  "source-qc.json": "source-qc",
  "classification-qc.json": "classification-qc",
  "comparability.json": "comparability",
  "availability.json": "availability",
  "privacy-disclosure.json": "privacy-disclosure",
  "methodology-snapshot.json": "methodology-snapshot",
  "reconciliation.json": "reconciliation",
} as const;

export type ScientificReportType = (typeof SCIENTIFIC_REPORTS)[keyof typeof SCIENTIFIC_REPORTS];

export type ScientificGateReport = Readonly<{
  schemaVersion: "1";
  reportType: ScientificReportType;
  period: string;
  capsuleId: string;
  status: "pass" | "fail";
  checkedAt: string;
  violations: readonly string[];
  warnings: readonly string[];
  hardSuppressions: readonly string[];
}> &
  Readonly<Record<string, unknown>>;

export type RebuildReceipt = Readonly<{
  schemaVersion: "1";
  period: string;
  capsuleId: string;
  candidateManifestSha256: string;
  primaryPublicArchiveHash: string;
  rebuiltPublicArchiveHash: string;
  preparedEmptyAt: string;
  verifiedAt: string;
  matched: true;
}>;

export type ReplicaReceipt = Readonly<{
  schemaVersion: "1";
  period: string;
  capsuleId: string;
  replicaId: string;
  mediaId: string;
  offsite: true;
  destinationId: string;
  candidateManifestSha256: string;
  artifactCount: number;
  verifiedAt: string;
  status: "pass";
}>;

export type QuarterValidationReport = Readonly<{
  schemaVersion: "1";
  period: string;
  capsuleId: string;
  status: "pass" | "fail";
  checkedAt: string;
  scientificReports: readonly ScientificReportType[];
  rebuildMatch: boolean;
  replicasVerified: number;
  mediaVerified: number;
  violations: readonly string[];
  warnings: readonly string[];
  hardSuppressions: readonly string[];
}>;

export const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

export const sha256Directory = async (
  root: string,
  ignoredNames: ReadonlySet<string> = new Set(),
): Promise<string> => {
  const rows: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignoredNames.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (entry.isSymbolicLink())
        throw new Error(`Release archive cannot contain symlinks: ${relative}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) rows.push(`${relative}\0${await sha256File(absolute)}`);
    }
  };
  await walk(root);
  return createHash("sha256").update(rows.join("\n")).digest("hex");
};

export const readScientificReports = async (
  evidenceDir: string,
  capsule: QuarterCapsule,
): Promise<ScientificGateReport[]> => {
  const reports: ScientificGateReport[] = [];
  for (const [filename, reportType] of Object.entries(SCIENTIFIC_REPORTS)) {
    const report = JSON.parse(
      await fs.readFile(path.join(evidenceDir, filename), "utf8"),
    ) as ScientificGateReport;
    if (
      report.schemaVersion !== "1" ||
      report.reportType !== reportType ||
      report.period !== capsule.period ||
      report.capsuleId !== capsule.capsuleId ||
      report.status !== "pass" ||
      !Array.isArray(report.violations) ||
      report.violations.length !== 0 ||
      !Array.isArray(report.warnings) ||
      !report.warnings.every((item) => typeof item === "string") ||
      !Array.isArray(report.hardSuppressions) ||
      !report.hardSuppressions.every((item) => typeof item === "string") ||
      !Number.isFinite(Date.parse(report.checkedAt))
    ) {
      throw new Error(`Scientific release report failed: ${filename}`);
    }
    reports.push(report);
  }
  return reports;
};

export const validateReleaseEvidence = (
  capsule: QuarterCapsule,
  reports: readonly ScientificGateReport[],
  rebuild: RebuildReceipt,
  replicas: readonly ReplicaReceipt[],
  candidateManifestSha256: string,
): QuarterValidationReport => {
  const violations: string[] = [];
  if (
    rebuild.schemaVersion !== "1" ||
    rebuild.period !== capsule.period ||
    rebuild.capsuleId !== capsule.capsuleId ||
    rebuild.candidateManifestSha256 !== candidateManifestSha256 ||
    !rebuild.matched ||
    rebuild.primaryPublicArchiveHash !== rebuild.rebuiltPublicArchiveHash
  ) {
    violations.push("empty_scratch_rebuild_mismatch");
  }
  const validReplicas = replicas.filter(
    (receipt) =>
      receipt.schemaVersion === "1" &&
      receipt.period === capsule.period &&
      receipt.capsuleId === capsule.capsuleId &&
      receipt.candidateManifestSha256 === candidateManifestSha256 &&
      receipt.offsite === true &&
      receipt.status === "pass" &&
      // capsule is the original candidate (no release artifacts yet).
      // +8 scientific reports + 3 (rebuild receipt + replica receipts + validation report).
      // Converges with quarter-release.ts: releaseCandidate.artifacts.length + 2
      // (releaseCandidate already has reports + rebuild, so only +2 for replica + validation).
      receipt.artifactCount ===
        capsule.artifacts.length + Object.keys(SCIENTIFIC_REPORTS).length + 3 &&
      /^[a-f0-9]{64}$/.test(receipt.destinationId) &&
      Number.isFinite(Date.parse(receipt.verifiedAt)),
  );
  const replicaIds = new Set(validReplicas.map((receipt) => receipt.replicaId));
  const mediaIds = new Set(validReplicas.map((receipt) => receipt.mediaId));
  const destinationIds = new Set(validReplicas.map((receipt) => receipt.destinationId));
  if (
    validReplicas.length < 2 ||
    replicaIds.size < 2 ||
    mediaIds.size < 2 ||
    destinationIds.size < 2
  ) {
    violations.push("three_two_one_replication_incomplete");
  }
  if (reports.length !== Object.keys(SCIENTIFIC_REPORTS).length) {
    violations.push("scientific_report_set_incomplete");
  }
  const failedReports = reports.filter((report) => report.status !== "pass");
  if (failedReports.length > 0) {
    violations.push(
      `scientific_report_failed:${failedReports
        .map((report) => report.reportType)
        .sort()
        .join(",")}`,
    );
  }
  return {
    schemaVersion: "1",
    period: capsule.period,
    capsuleId: capsule.capsuleId,
    status: violations.length === 0 ? "pass" : "fail",
    checkedAt: new Date().toISOString(),
    scientificReports: reports.map((report) => report.reportType).sort(),
    rebuildMatch: violations.includes("empty_scratch_rebuild_mismatch") === false,
    replicasVerified: replicaIds.size,
    mediaVerified: mediaIds.size,
    violations,
    warnings: reports.flatMap((report) => report.warnings),
    hardSuppressions: reports.flatMap((report) => report.hardSuppressions),
  };
};

export const artifactForFile = async (
  capsuleDir: string,
  uri: string,
  stage: CapsuleArtifact["stage"] = "qc",
): Promise<CapsuleArtifact> => {
  const absolute = path.join(capsuleDir, uri);
  const stat = await fs.stat(absolute);
  return { stage, uri, sha256: await sha256File(absolute), bytes: stat.size };
};
