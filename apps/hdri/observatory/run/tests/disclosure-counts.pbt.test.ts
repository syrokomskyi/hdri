import { expect, test } from "vitest";
import fc from "fast-check";
import { checkComplementarySuppression } from "../release/release-contract";

test("any eligible quarterly sample size passes count checks regardless of growth", () => {
  // Validity depends on this quarter's matching counts and k, not on monotonicity.
  fc.assert(fc.property(fc.integer({ min: 12, max: 1000000 }), n => {
    const result = checkComplementarySuppression([
      { product: "cross-section", format: "json", contentSha256: "a", n },
      { product: "cross-section", format: "csv", contentSha256: "b", n },
    ], 12);
    expect(result).toEqual({ status: "pass", violations: [], crossFormatMismatches: [], crossQuarterAssessment: "not-assessed" });
  }), { seed: 20260928, numRuns: 100 });
});

test("cell checks compare matching cells, not the number of aggregate rows", () => {
  const result = checkComplementarySuppression([
    { product: "cross-section", format: "json", cellKey: "all", contentSha256: "a", n: 101321 },
    { product: "cross-section", format: "csv", cellKey: "all", contentSha256: "b", n: 101321 },
    { product: "cross-section", format: "json", cellKey: "region", contentSha256: "a", n: 1200 },
    { product: "cross-section", format: "csv", cellKey: "region", contentSha256: "b", n: 1200 },
  ], 12);
  expect(result.status).toBe("pass");
});

test.each([NaN, Infinity, -1, 1.5])("invalid count %s cannot pass", n => {
  expect(checkComplementarySuppression([{ product: "cross-section", format: "json", contentSha256: "a", n }], 12).status).toBe("fail");
});
