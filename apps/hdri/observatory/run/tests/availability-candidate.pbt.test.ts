import { expect, test } from "vitest";
import fc from "fast-check";
import { summarizeAvailability } from "../release/availability-candidate";

const scope = { period: "2026-q3", capsuleId: "test-capsule", deviceId: "test-device" };
// Set partition: each unique target contributes exactly once, regardless of traversal order.
test("outcome partition is exhaustive and order independent", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.constantFrom(
          "reachable" as const,
          "unavailable" as const,
          "blocked" as const,
          "indeterminate" as const,
        ),
        { minLength: 1, maxLength: 2000 },
      ),
      (outcomes) => {
        const records = outcomes.map((outcome, i) => ({ assetId: String(i), outcome }));
        const targets = records.map((record) => record.assetId);
        const result = summarizeAvailability(scope, targets, records, 12);
        expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(targets.length);
        expect(
          summarizeAvailability(scope, targets.toReversed(), records.toReversed(), 12),
        ).toEqual(result);
        expect(result.reachableShareOfTargets).toBeGreaterThanOrEqual(0);
        expect(result.reachableShareOfTargets).toBeLessThanOrEqual(1);
      },
    ),
    { seed: 20260926, numRuns: 100 },
  );
});
