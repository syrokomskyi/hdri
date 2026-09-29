import { expect, test } from "vitest";
import { decodeDashboardCrossSection } from "../../tools/dashboard-cross-section";

const summary = { n: 24, mean: 30, p10: 20, p25: 25, p50: 30, p75: 35, p90: 40, min: 10, max: 50, stdDev: 10 };
export const rows = () => [
  { section: "overview", ...summary },
  { section: "confidence", n: 24, mean: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, min: 1, max: 1, stdDev: 0 },
  { section: "maturity", id: "basis", label: "Basis", n: 24, share: 1 },
  { section: "dimension", id: "contact", label: "Kontakt", weight: 0.22, ...summary },
  { section: "bundesland", id: "BE", label: "Berlin", ...summary },
  { section: "gewerk", id: "bau", label: "Bau", ...summary },
  { section: "matrix", bundesland: "BE", gewerk: "bau", n: 24, mean: 30, p10: 20, p25: 25, p50: 30, p75: 35, p90: 40 },
];

test("decodes all five dashboard payloads without rescoring or modifying input", () => {
  const json = JSON.stringify(rows());
  const result = decodeDashboardCrossSection(json, 12);
  expect(result.overview).toEqual({ sampleSize: 24, summary, confidence: { n: 24, mean: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, min: 1, max: 1, stdDev: 0 }, maturity: [{ id: "basis", label: "Basis", count: 24, share: 1 }] });
  expect(result.dimensions).toEqual([{ id: "contact", label: "Kontakt", weight: 0.22, ...summary }]);
  expect(result.bundeslaender).toEqual([{ id: "BE", label: "Berlin", ...summary }]);
  expect(result.gewerke).toEqual([{ id: "bau", label: "Bau", ...summary }]);
  expect(result.matrix).toEqual([{ bundesland: "BE", gewerk: "bau", n: 24, mean: 30, p10: 20, p25: 25, p50: 30, p75: 35, p90: 40 }]);
  expect(JSON.stringify(rows())).toBe(json);
});

test.each([
  ["private column", (r: Record<string, unknown>[]) => { r[0]!.domain = "private.example"; }, "FIELDS"],
  ["missing field", (r: Record<string, unknown>[]) => { delete r[0]!.mean; }, "FIELDS"],
  ["duplicate singleton", (r: Record<string, unknown>[]) => { r.push(r[0]!); }, "DUPLICATE"],
  ["missing singleton", (r: Record<string, unknown>[]) => { r.shift(); }, "INCOMPLETE"],
  ["small cell", (r: Record<string, unknown>[]) => { r[6]!.n = 11; }, "SMALL_CELL"],
  ["wrong band count", (r: Record<string, unknown>[]) => { r[2]!.n = 12; }, "SAMPLE_MISMATCH"],
  ["wrong band share", (r: Record<string, unknown>[]) => { r[2]!.share = 0.5; }, "SAMPLE_MISMATCH"],
  ["reversed quantile", (r: Record<string, unknown>[]) => { r[0]!.p25 = 45; }, "QUANTILES"],
  ["non-number", (r: Record<string, unknown>[]) => { r[0]!.mean = null; }, "NUMBER"],
  ["unknown section", (r: Record<string, unknown>[]) => { r[0]!.section = "__proto__"; }, "SECTION"],
] as const)("rejects %s before projection", (_name, mutate, message) => {
  const input: Record<string, unknown>[] = rows();
  mutate(input);
  expect(() => decodeDashboardCrossSection(JSON.stringify(input), 12)).toThrow(message);
});
