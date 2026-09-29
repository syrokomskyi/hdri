import { expect, test } from "vitest";
import fc from "fast-check";
import { serializeAvailabilityPreview } from "../release/availability-preview";

// Projection preserves every outcome and the sum, independently of private metadata.
test("preview preserves the complete four-way partition and projects only public fields", () => {
  fc.assert(fc.property(
    fc.tuple(...Array.from({ length: 4 }, () => fc.oneof(fc.constant(0), fc.integer({ min: 12, max: 1000000 })))),
    fc.string(),
    (counts, privateMetadata) => {
      const [reachable, unavailable, blocked, indeterminate] = counts as [number, number, number, number];
      const n = reachable + unavailable + blocked + indeterminate;
      fc.pre(n >= 12);
      const input = { schema: "hdri-availability-candidate@1", status: "candidate-not-approved",
        period: "2026-q3", denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1",
        effectiveK: 12, n, counts: { reachable, unavailable, blocked, indeterminate },
        reachableShareOfTargets: reachable / n };
      const plain = serializeAvailabilityPreview(input, 12);
      expect(serializeAvailabilityPreview({ ...input, domain: privateMetadata, source: privateMetadata }, 12)).toEqual(plain);
      expect(JSON.parse(plain.json).rows[0]).toEqual({ period: "2026-q3", n, reachable, unavailable,
        blocked, indeterminate, reachable_share_of_targets: reachable / n });
    }), { seed: 20260926, numRuns: 100 });
});
