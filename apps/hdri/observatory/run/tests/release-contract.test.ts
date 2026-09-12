import { describe, expect, it } from "vitest";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import {
  computeClosureDigest,
  createReleaseEnvelope,
  validateReplicaIndependence,
  verifyReleaseEnvelope,
  type ReplicaReceipt,
} from "../release/release-contract";

const capsule: QuarterCapsule = {
  period: "2026-q3",
  capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc",
  state: "candidate",
  instrumentPlan: [],
  artifacts: [],
};

const makeReceipt = (
  replicaId: string,
  failureDomain: string,
  credentialBoundary: string,
): ReplicaReceipt => ({
  schema: "hdri-replica-receipt@1",
  replicaId,
  failureDomain,
  mediaId: `${replicaId}-media`,
  credentialBoundary,
  envelopeSha256: "e".repeat(64),
  closureDigest: "f".repeat(64),
  verifiedBytes: 1024,
  verifiedObjects: 8,
  verifiedAt: "2026-08-03T02:00:00.000Z",
});

const inventory = [
  { uri: "capsule-manifest.json", sha256: "a".repeat(64), bytes: 100, access: "internal" as const },
  {
    uri: "capsule-candidate.json",
    sha256: "b".repeat(64),
    bytes: 200,
    access: "internal" as const,
  },
  {
    uri: "artifacts/publication/data.csv",
    sha256: "c".repeat(64),
    bytes: 300,
    access: "public" as const,
  },
];

const makeEnvelope = () =>
  createReleaseEnvelope(
    capsule.capsuleId,
    capsule.period,
    "a".repeat(64),
    "b".repeat(64),
    inventory,
    "c".repeat(64),
    "d".repeat(64),
    "e".repeat(64),
  );

describe("RFC-0109 release envelope contracts", () => {
  it("computeClosureDigest produces stable hash for same inventory regardless of input order", () => {
    const digestA = computeClosureDigest(inventory);
    const digestB = computeClosureDigest([...inventory].reverse());
    expect(digestA).toBe(digestB);
    expect(digestA).toHaveLength(64);
  });

  it("computeClosureDigest changes when inventory content changes", () => {
    const modified = [...inventory];
    modified[0] = { ...modified[0]!, bytes: 999 };
    expect(computeClosureDigest(modified)).not.toBe(computeClosureDigest(inventory));
  });

  it("verifyReleaseEnvelope passes for a valid envelope", () => {
    const envelope = makeEnvelope();
    const violations = verifyReleaseEnvelope(envelope);
    expect(violations).toHaveLength(0);
  });

  it("verifyReleaseEnvelope rejects an envelope with wrong schema", () => {
    const envelope = { ...makeEnvelope(), schema: "wrong" as never };
    const violations = verifyReleaseEnvelope(envelope);
    expect(violations).toContain("envelope_schema_mismatch");
  });

  it("verifyReleaseEnvelope rejects invalid sha256 hashes", () => {
    const envelope = makeEnvelope();
    envelope.measurementCapsuleSha256 = "short";
    const violations = verifyReleaseEnvelope(envelope);
    expect(violations).toContain("envelope_measurement_capsule_hash_invalid");
  });

  it("validateReplicaIndependence passes with distinct failure domains and credential boundaries", () => {
    const violations = validateReplicaIndependence([
      makeReceipt("rep-a", "dc-a", "cred-a"),
      makeReceipt("rep-b", "dc-b", "cred-b"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it("validateReplicaIndependence fails when two receipts share a failure domain", () => {
    const violations = validateReplicaIndependence([
      makeReceipt("rep-a", "dc-a", "cred-a"),
      makeReceipt("rep-b", "dc-a", "cred-b"),
    ]);
    expect(violations).toContain("shared_failure_domain");
  });

  it("validateReplicaIndependence fails when two receipts share a credential boundary", () => {
    const violations = validateReplicaIndependence([
      makeReceipt("rep-a", "dc-a", "cred-a"),
      makeReceipt("rep-b", "dc-b", "cred-a"),
    ]);
    expect(violations).toContain("shared_credential_boundary");
  });

  it("validateReplicaIndependence fails with fewer than 2 replicas", () => {
    const violations = validateReplicaIndependence([makeReceipt("rep-a", "dc-a", "cred-a")]);
    expect(violations).toContain("insufficient_replicas");
  });
});
