import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import {
  SCIENTIFIC_REPORTS,
  validateReleaseEvidence,
  type RebuildReceipt,
  type ReplicaReceipt,
  type ScientificGateReport,
} from "../release/release-contract";

const capsule: QuarterCapsule = {
  period: "2026-q3",
  capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc",
  state: "candidate",
  instrumentPlan: [],
  artifacts: [],
};
const candidateHash = "a".repeat(64);
const reports = Object.values(SCIENTIFIC_REPORTS).map((reportType) => ({
  schemaVersion: "1",
  reportType,
  period: capsule.period,
  capsuleId: capsule.capsuleId,
  status: "pass",
  checkedAt: "2026-08-03T00:00:00.000Z",
  violations: [],
  warnings: [],
  hardSuppressions: [],
})) satisfies ScientificGateReport[];
const rebuild: RebuildReceipt = {
  schemaVersion: "1",
  period: capsule.period,
  capsuleId: capsule.capsuleId,
  candidateManifestSha256: candidateHash,
  primaryPublicArchiveHash: "b".repeat(64),
  rebuiltPublicArchiveHash: "b".repeat(64),
  preparedEmptyAt: "2026-08-03T00:00:00.000Z",
  verifiedAt: "2026-08-03T01:00:00.000Z",
  matched: true,
};
const replica = (replicaId: string, mediaId: string): ReplicaReceipt => ({
  schemaVersion: "1",
  period: capsule.period,
  capsuleId: capsule.capsuleId,
  replicaId,
  mediaId,
  offsite: true,
  destinationId: createHash("sha256").update(replicaId).digest("hex"),
  candidateManifestSha256: candidateHash,
  artifactCount: Object.keys(SCIENTIFIC_REPORTS).length + 3,
  verifiedAt: "2026-08-03T02:00:00.000Z",
  status: "pass",
});

describe("quarter scientific release boundary", () => {
  it("passes only with complete scientific reports, matching rebuild and two media", () => {
    const result = validateReleaseEvidence(
      capsule,
      reports,
      rebuild,
      [replica("offsite-a", "disk-a"), replica("offsite-b", "object-store-b")],
      candidateHash,
    );
    expect(result.status).toBe("pass");
    expect(result.replicasVerified).toBe(2);
    expect(result.mediaVerified).toBe(2);
  });

  it("blocks a release when both copies are on one medium", () => {
    const result = validateReleaseEvidence(
      capsule,
      reports,
      rebuild,
      [replica("offsite-a", "same-disk"), replica("offsite-b", "same-disk")],
      candidateHash,
    );
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("three_two_one_replication_incomplete");
  });

  it("blocks a release when rebuild hash does not match", () => {
    const badRebuild: RebuildReceipt = {
      ...rebuild,
      rebuiltPublicArchiveHash: "c".repeat(64),
    };
    const result = validateReleaseEvidence(
      capsule,
      reports,
      badRebuild,
      [replica("offsite-a", "disk-a"), replica("offsite-b", "object-store-b")],
      candidateHash,
    );
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("empty_scratch_rebuild_mismatch");
    expect(result.rebuildMatch).toBe(false);
  });

  it("blocks a release with only one replica", () => {
    const result = validateReleaseEvidence(
      capsule,
      reports,
      rebuild,
      [replica("offsite-a", "disk-a")],
      candidateHash,
    );
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("three_two_one_replication_incomplete");
  });

  it("blocks a release with incomplete scientific reports", () => {
    const partialReports = reports.slice(0, -1);
    const result = validateReleaseEvidence(
      capsule,
      partialReports,
      rebuild,
      [replica("offsite-a", "disk-a"), replica("offsite-b", "object-store-b")],
      candidateHash,
    );
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("scientific_report_set_incomplete");
  });

  it("blocks a release when a scientific report has status fail", () => {
    const failedReports = reports.map((report) =>
      report.reportType === "source-qc"
        ? { ...report, status: "fail" as const, warnings: ["source_coverage_below_threshold"] }
        : report,
    );
    const result = validateReleaseEvidence(
      capsule,
      failedReports,
      rebuild,
      [replica("offsite-a", "disk-a"), replica("offsite-b", "object-store-b")],
      candidateHash,
    );
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("scientific_report_failed:source-qc");
    expect(result.warnings).toContain("source_coverage_below_threshold");
  });
});
