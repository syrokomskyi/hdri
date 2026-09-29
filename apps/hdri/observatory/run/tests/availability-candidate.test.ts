import { expect, test } from "vitest";
import {
  summarizeAvailability,
  deriveAvailabilityCandidate,
} from "../release/availability-candidate";
import type { VerifiedQuarterExecution } from "@syrokomskyi/factory-core";

const scope = { period: "2026-q3", capsuleId: "test-capsule", deviceId: "test-device" };
test("all sealed targets remain in the denominator, including blocked and indeterminate", () => {
  const result = summarizeAvailability(
    scope,
    ["a", "b", "c", "d"],
    [
      { assetId: "a", outcome: "reachable" },
      { assetId: "b", outcome: "unavailable" },
      { assetId: "c", outcome: "blocked" },
      { assetId: "d", outcome: "indeterminate" },
    ],
    1,
  );
  expect(result.n).toBe(4);
  expect(result.counts).toEqual({ reachable: 1, unavailable: 1, blocked: 1, indeterminate: 1 });
  expect(result.reachableShareOfTargets).toBe(0.25);
  expect(result.status).toBe("candidate-not-approved");
});
test("equal counts cannot conceal a substituted target", () => {
  expect(() =>
    summarizeAvailability(scope, ["a"], [{ assetId: "b", outcome: "reachable" }], 1),
  ).toThrow("OUTSIDE_TARGET");
});
test("duplicates and missing targets fail instead of changing the denominator", () => {
  expect(() => summarizeAvailability(scope, ["a", "a"], [], 1)).toThrow("TARGET_SET_INVALID");
  expect(() => summarizeAvailability(scope, ["a"], [], 1)).toThrow("TARGETS_MISSING");
  expect(() =>
    summarizeAvailability(
      scope,
      ["a", "b"],
      [
        { assetId: "a", outcome: "reachable" },
        { assetId: "a", outcome: "reachable" },
      ],
      1,
    ),
  ).toThrow("DUPLICATE");
});
test("small nonzero cells suppress the entire candidate, preserving its private accounting", () => {
  const result = summarizeAvailability(
    scope,
    ["a", "b", "c"],
    [
      { assetId: "a", outcome: "reachable" },
      { assetId: "b", outcome: "reachable" },
      { assetId: "c", outcome: "blocked" },
    ],
    2,
  );
  expect(result.cellPrivacy).toEqual({
    status: "fail",
    violations: ["small_outcome_cell:blocked"],
  });
  expect(result.counts.blocked).toBe(1);
});
test("an all-unavailable frame has zero reachability rather than zero attrition", () => {
  const result = summarizeAvailability(scope, ["a"], [{ assetId: "a", outcome: "unavailable" }], 1);
  expect(result.reachableShareOfTargets).toBe(0);
  expect(result).not.toHaveProperty("attritionRate");
});
test.each([0, -1, 1.5, NaN, Infinity])("invalid privacy threshold %s fails closed", (k) => {
  expect(() =>
    summarizeAvailability(scope, ["a"], [{ assetId: "a", outcome: "reachable" }], k),
  ).toThrow("K_INVALID");
});
test("caller-created execution evidence is rejected before filesystem access", async () => {
  await expect(
    deriveAvailabilityCandidate("/must-not-read", {} as VerifiedQuarterExecution, scope, 12),
  ).rejects.toThrow();
});
