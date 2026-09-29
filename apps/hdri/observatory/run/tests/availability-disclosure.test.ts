import { expect, test } from "vitest";
import { serializeAvailabilityPreview } from "../release/availability-preview";
import { reviewAvailabilityDisclosure } from "../release/availability-disclosure";

function preview() {
  return serializeAvailabilityPreview({ schema: "hdri-availability-candidate@1", status: "candidate-not-approved",
    period: "2026-q3", denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1", effectiveK: 12,
    n: 100, counts: { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 }, reachableShareOfTargets: 0.4 }, 12);
}
test("independent review checks both actual producer formats without certifying other releases", () => {
  const { json, csv } = preview(); const result = reviewAvailabilityDisclosure(json, csv, "2026-q3", 12);
  expect(result.status).toBe("single-product-checked-not-release-admission");
  expect(result.filesChecked).toBe(2); expect(result.cellsChecked).toBe(5);
});
test.each(["domain", "asset_id", "url", "extra"])("rejects an undeclared %s field even with safe counts", key => {
  const { json, csv } = preview(); const data = JSON.parse(json); data.rows[0][key] = "private.invalid";
  expect(() => reviewAvailabilityDisclosure(JSON.stringify(data, null, 2) + "\n", csv, "2026-q3", 12)).toThrow("FIELDS");
});
test("rejects hidden duplicate JSON keys", () => {
  const { json, csv } = preview();
  expect(() => reviewAvailabilityDisclosure(json.replace('"n": 100', '"n": "private", "n": 100'), csv, "2026-q3", 12)).toThrow("NONCANONICAL");
});
test("counts safe in JSON cannot conceal different CSV counts", () => {
  const { json, csv } = preview();
  expect(() => reviewAvailabilityDisclosure(json, csv.replace(",40,30,", ",30,40,"), "2026-q3", 12)).toThrow("CROSS_FORMAT");
});
test("a small outcome cannot be published alongside its revealing total", () => {
  const { json, csv } = preview(); const data = JSON.parse(json); data.rows[0].blocked = 1; data.rows[0].indeterminate = 29;
  expect(() => reviewAvailabilityDisclosure(JSON.stringify(data, null, 2) + "\n", csv, "2026-q3", 12)).toThrow("SMALL_CELL");
});
test("free-form interpretation cannot carry unreviewed identifiers or new scientific claims", () => {
  const { json, csv } = preview(); const data = JSON.parse(json); data.interpretation.push("private.invalid");
  expect(() => reviewAvailabilityDisclosure(JSON.stringify(data, null, 2) + "\n", csv, "2026-q3", 12)).toThrow("SCHEMA_MISMATCH");
});
test("wrong quarter fails even if both formats agree", () => {
  const { json, csv } = preview();
  expect(() => reviewAvailabilityDisclosure(json, csv, "2026-q2", 12)).toThrow("PERIOD_MISMATCH");
});
