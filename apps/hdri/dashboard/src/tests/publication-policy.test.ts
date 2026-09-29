import { expect, test } from "vitest";
import { publicationThreshold } from "../data/publication-policy";
import q2 from "../assets/data/public/periods/2026-q2/manifest.json";
import q3 from "../assets/data/public/periods/2026-q3/manifest.json";

test("Q2 original threshold is five without rewriting the retained regenerated manifest", () => {
  const original = JSON.stringify(q2);
  expect(q2.kAnonymityMin).toBe(12);
  expect(publicationThreshold(q2)).toBe(5);
  expect(JSON.stringify(q2)).toBe(original);
  expect(publicationThreshold({...q2, kAnonymityMin: 5})).toBe(5);
});

test("Q3 and future releases keep their own policy rather than inheriting the Q2 erratum", () => {
  expect(publicationThreshold(q3)).toBe(12);
  expect(publicationThreshold({...q3, period: "2026-q4", kAnonymityMin: 20})).toBe(20);
  expect(publicationThreshold({...q2, observatoryRunId: "another-release", kAnonymityMin: 8})).toBe(8);
});

test("unexpected changes to the bound Q2 metadata require review rather than silent correction", () => {
  expect(() => publicationThreshold({...q2, kAnonymityMin: 20})).toThrow("documented metadata correction");
});
