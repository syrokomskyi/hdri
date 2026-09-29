import { expect, test } from "vitest";
import fc from "fast-check";
import { decodeDashboardCrossSection } from "../../tools/dashboard-cross-section";

test("decoding preserves sample counts and aggregate values across admissible samples", () => {
  // Projection preserves numeric values: no scaling, accumulation or rescoring is permitted.
  fc.assert(fc.property(fc.integer({ min: 12, max: 1000000 }), fc.integer({ min: 0, max: 100 }), (n, score) => {
    const summary = { n, mean: score, p10: score, p25: score, p50: score, p75: score, p90: score, min: score, max: score, stdDev: 0 };
    const confidence = { n, mean: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, min: 1, max: 1, stdDev: 0 };
    const input = [{ section: "overview", ...summary }, { section: "confidence", ...confidence }, { section: "maturity", id: "band", label: "Band", n, share: 1 }];
    expect(decodeDashboardCrossSection(JSON.stringify(input), 12).overview).toEqual({ sampleSize: n, summary, confidence, maturity: [{ id: "band", label: "Band", count: n, share: 1 }] });
  }), { seed: 20260928, numRuns: 100 });
});
