import { describe, expect, it } from "vitest";
import type { PopulationFrame } from "../../tools/poststrat-core";
import { validateFrame } from "../../tools/frame-core";

const frame = (weights: Record<string, number>): PopulationFrame => ({
  strataSystem: "bundesland|destatis_group",
  source: "test",
  weights,
});

describe("validateFrame (post-stratification readiness)", () => {
  it("passes a fully-covering frame and clears the threshold", () => {
    const sample = new Map([
      ["Bayern|I", 100],
      ["Bayern|II", 50],
    ]);
    const v = validateFrame(frame({ "Bayern|I": 8000, "Bayern|II": 6000 }), sample);
    expect(v.ok).toBe(true);
    expect(v.coveredStrata).toBe(2);
    expect(v.projectedWeightCoverage).toBe(1);
    expect(v.missingInFrame).toHaveLength(0);
  });

  it("reports sampled strata missing from the frame and suppresses on low coverage", () => {
    const sample = new Map([
      ["Bayern|I", 100],
      ["Bayern|II", 50],
      ["Berlin|I", 40],
    ]);
    // Only Bayern|I is weighted → coverage = 8000 / 8000 = 100% of POSITIVE frame weight,
    // but two sampled strata are unweighted and must be surfaced.
    const v = validateFrame(frame({ "Bayern|I": 8000 }), sample);
    expect(v.missingInFrame.map((m) => m.key)).toEqual(["Bayern|II", "Berlin|I"]);
    expect(v.missingInFrame[0]).toEqual({ key: "Bayern|II", sampleN: 50 }); // sorted by sampleN desc
    expect(v.coveredStrata).toBe(1);
  });

  it("projects coverage as covered / total positive frame weight and applies the 95% threshold", () => {
    const sample = new Map([["Bayern|I", 100]]);
    // Bayern|I covered (weight 30) out of total positive 100 → 30% < 95% → suppressed.
    const v = validateFrame(frame({ "Bayern|I": 30, "Berlin|I": 70 }), sample);
    expect(v.projectedWeightCoverage).toBe(0.3);
    expect(v.meetsThreshold).toBe(false);
    expect(v.ok).toBe(false);
    expect(v.unknownInFrame).toEqual(["Berlin|I"]); // in frame, never sampled
  });

  it("flags NaN/negative weights but treats a 0 cell as valid-unfilled", () => {
    const sample = new Map([["Bayern|I", 100]]);
    const v = validateFrame(
      frame({ "Bayern|I": 8000, "Bayern|II": 0, "Berlin|I": Number.NaN, "Hessen|I": -5 }),
      sample,
    );
    expect(v.invalidWeights.sort()).toEqual(["Berlin|I", "Hessen|I"]); // NaN + negative, NOT the 0
    expect(v.ok).toBe(false); // an invalid weight blocks publish
  });

  it("an all-zero frame is not usable (no positive strata)", () => {
    const sample = new Map([["Bayern|I", 100]]);
    const v = validateFrame(frame({ "Bayern|I": 0, "Bayern|II": 0 }), sample);
    expect(v.positiveFrameStrata).toBe(0);
    expect(v.ok).toBe(false);
  });

  it("fails when national coverage is high but one Land falls below the 80% floor", () => {
    const sample = new Map([
      ["Bayern|I", 100],
      ["Berlin|I", 100],
    ]);
    const v = validateFrame(
      frame({ "Bayern|I": 990, "Berlin|I": 5, "Berlin|II": 5 }),
      sample,
    );
    expect(v.projectedWeightCoverage).toBe(0.995);
    expect(v.minimumBundeslandCoverage).toBe(0.5);
    expect(v.ok).toBe(false);
  });
});
