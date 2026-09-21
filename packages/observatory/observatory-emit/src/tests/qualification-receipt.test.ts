import { describe, expect, it } from "vitest";
import { validateQualificationReceipt } from "../qualification-receipt.js";

const structuralReceipt = () => ({
  schema: "hdri-qualification@1",
  implementationFingerprint: "a".repeat(64),
  policySha256: "b".repeat(64),
  fixtureManifestSha256: "c".repeat(64),
  targets: 1000,
  productionStages: [
    "source-admission",
    "frame-identity",
    "liveness",
    "homepage-capture",
    "detected-capture",
    "extraction",
    "browser-audit",
    "translation",
    "scoring",
    "scientific-check",
    "privacy-check",
    "replication",
    "independent-rebuild",
  ],
  peakCoordinatorRssBytes: 1024,
  peakProcessTreeRssBytes: 2048,
  peakInodes: 10,
  diskBytes: 1000,
  durationMs: 100,
  resumeEquivalenceSha256: "d".repeat(64),
  violations: [],
  status: "pass",
});

describe("qualification receipt distrusts unchecked runtime input", () => {
  it.each([null, undefined, [], {}, "pass"])(
    "rejects malformed input %j without throwing",
    (input) => {
      expect(validateQualificationReceipt(input)).toContain("INVALID_SCHEMA");
    },
  );

  it("detects an absent stage even when the producer claims pass with no violations", () => {
    const input = structuralReceipt();
    input.productionStages.pop();
    expect(validateQualificationReceipt(input)).toContain(
      "MISSING_STAGE_PROOF:independent-rebuild",
    );
  });

  it("rejects duplicate stages even when the array still contains thirteen names", () => {
    const input = structuralReceipt();
    input.productionStages[12] = "source-admission";
    expect(validateQualificationReceipt(input)).toContain("DUPLICATE_STAGE:source-admission");
  });

  it("rejects an unknown stage", () => {
    const input = structuralReceipt();
    input.productionStages.push("invented-stage");
    expect(validateQualificationReceipt(input)).toContain("UNKNOWN_STAGE:invented-stage");
  });

  it("never interprets fail with an empty violations list as successful qualification", () => {
    expect(validateQualificationReceipt({ ...structuralReceipt(), status: "fail" })).toContain(
      "QUALIFICATION_FAILED",
    );
  });

  it.each([
    "peakCoordinatorRssBytes",
    "peakProcessTreeRssBytes",
    "peakInodes",
    "diskBytes",
    "durationMs",
  ])("rejects absent, zero, negative and non-finite %s measurements", (field) => {
    for (const value of [undefined, 0, -1, NaN, Infinity, "100"]) {
      expect(validateQualificationReceipt({ ...structuralReceipt(), [field]: value })).toContain(
        `INVALID_MEASUREMENT:${field}`,
      );
    }
  });

  it("rejects a process-tree peak below the coordinator peak", () => {
    expect(
      validateQualificationReceipt({ ...structuralReceipt(), peakProcessTreeRssBytes: 1 }),
    ).toContain("INVALID_PROCESS_TREE_MEASUREMENT");
  });

  it.each([
    "implementationFingerprint",
    "policySha256",
    "fixtureManifestSha256",
    "resumeEquivalenceSha256",
  ])("requires a complete content digest in %s", (field) => {
    expect(
      validateQualificationReceipt({ ...structuralReceipt(), [field]: "name-not-content" }),
    ).toContain(`INVALID_DIGEST:${field}`);
  });

  it("rejects unsupported target counts", () => {
    expect(validateQualificationReceipt({ ...structuralReceipt(), targets: 13 })).toContain(
      "INVALID_TARGET_COUNT",
    );
  });

  it("rejects non-string violation entries", () => {
    expect(validateQualificationReceipt({ ...structuralReceipt(), violations: [null] })).toContain(
      "INVALID_VIOLATIONS",
    );
  });
});
