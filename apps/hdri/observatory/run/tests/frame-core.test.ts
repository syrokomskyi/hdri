import { describe, expect, it } from "vitest";
import type { PopulationFrame } from "../../tools/poststrat-core";
import { buildTemplateFrame, validateFrame } from "../../tools/frame-core";

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

  it("projects coverage as covered / total POSITIVE frame weight and applies the 60% threshold", () => {
    const sample = new Map([["Bayern|I", 100]]);
    // Bayern|I covered (weight 30) out of total positive 100 → 30% < 60% → suppressed.
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
});

describe("buildTemplateFrame", () => {
  it("emits an all-zero frame keyed by the real sampled strata, sorted", () => {
    const tpl = buildTemplateFrame(["Berlin|I", "Bayern|II", "Bayern|I"]);
    expect(Object.keys(tpl.weights)).toEqual(["Bayern|I", "Bayern|II", "Berlin|I"]);
    expect(Object.values(tpl.weights)).toEqual([0, 0, 0]);
    expect(tpl.strataSystem).toBe("bundesland|destatis_group");
    // Round-trips through validateFrame as an unusable (all-zero) frame.
    expect(validateFrame(tpl, new Map([["Bayern|I", 10]])).ok).toBe(false);
  });
});
