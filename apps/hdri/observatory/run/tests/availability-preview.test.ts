import { expect, test } from "vitest";
import { serializeAvailabilityPreview } from "../release/availability-preview";

const candidate = () => ({
  schema: "hdri-availability-candidate@1", status: "candidate-not-approved",
  period: "2026-q3", denominator: "sealed-liveness-targets",
  outcomePolicy: "availability-outcome-v1", effectiveK: 12,
  n: 100, counts: { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 },
  reachableShareOfTargets: 0.4,
  cellPrivacy: { status: "pass" }, domain: "private.invalid", source: { secret: "private-source" },
});

test("four-outcome preview keeps uncertainty in the denominator and has no release authority", () => {
  const output = serializeAvailabilityPreview(candidate(), 12);
  expect(output.status).toBe("preview-not-approved");
  expect(output.schemaId).toBe("hdri-public-availability@2");
  expect(output.csv).toBe("period,n,reachable,unavailable,blocked,indeterminate,reachable_share_of_targets\n2026-q3,100,40,30,15,15,0.4\n");
  expect(JSON.parse(output.json).rows).toEqual([{ period: "2026-q3", n: 100, reachable: 40,
    unavailable: 30, blocked: 15, indeterminate: 15, reachable_share_of_targets: 0.4 }]);
  expect(output.json).not.toContain("private.invalid");
  expect(output.json).not.toContain("private-source");
});

test("a claimed privacy pass cannot hide a small cell", () => {
  const value = candidate();
  value.counts.blocked = 1;
  value.counts.indeterminate = 29;
  expect(() => serializeAvailabilityPreview(value, 12)).toThrow("SMALL_CELL");
});

test("zero outcomes are preserved without fabricating suppressed counts", () => {
  const value = candidate();
  value.counts.blocked = 0;
  value.counts.indeterminate = 30;
  expect(JSON.parse(serializeAvailabilityPreview(value, 12).json).rows[0].blocked).toBe(0);
});

test.each([
  { n: 99 }, { reachableShareOfTargets: 0.7 }, { effectiveK: 1 },
  { denominator: "resolved-targets" }, { outcomePolicy: "unknown" },
  { period: "2026-q3\nprivate" }, { status: "approved" },
  { counts: { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15, extra: 1 } },
  { counts: { reachable: 40.5, unavailable: 29.5, blocked: 15, indeterminate: 15 } },
  { counts: { reachable: -40, unavailable: 110, blocked: 15, indeterminate: 15 } },
])("malformed or reinterpreted aggregate is rejected: %j", change => {
  expect(() => serializeAvailabilityPreview({ ...candidate(), ...change }, 12)).toThrow();
});

test("preview is deterministic and does not mutate caller data", () => {
  const input = candidate();
  const before = JSON.stringify(input);
  expect(serializeAvailabilityPreview(input, 12)).toEqual(serializeAvailabilityPreview(input, 12));
  expect(JSON.stringify(input)).toBe(before);
});
