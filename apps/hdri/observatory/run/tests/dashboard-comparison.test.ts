/**
 * WP3: cross-quarter comparison guard rails (the scientific integrity of deltas).
 *
 * Covers the pure decision logic extracted into tools/comparison-core.ts:
 * - codebook/ontology version change → delta HARD-suppressed (scores not comparable)
 * - large sample-frame shift (e.g. tripled N) → delta still shown but reliability
 *   downgraded and a comparabilityWarning attached (confounded by composition)
 * - k-anonymity and minimum-delta suppression still apply
 */

import { describe, it, expect } from "vitest";
import {
  createComparisonPoint,
  computeComparabilityWarnings,
  versionMismatchReasons,
  type ScoreSummary,
} from "../../tools/comparison-core";

const summary = (n: number, p75: number): ScoreSummary => ({
  n,
  mean: p75 - 5,
  p10: p75 - 20,
  p25: p75 - 10,
  p50: p75 - 5,
  p75,
  p90: p75 + 10,
  min: 0,
  max: 100,
  stdDev: 10,
});

const base = {
  axis: "overall" as const,
  period: "2026-q3",
  previousPeriod: "2026-q2",
  label: "HDRI Gesamt",
  key: "overall",
  currentPresent: true,
  previousPresent: true,
  versionMismatch: [],
};

describe("versionMismatchReasons", () => {
  it("returns nothing when versions match or there is no previous", () => {
    const v = { codebookVersion: "1.3.0", ontologyVersion: "1.0.0" };
    expect(versionMismatchReasons(v, v)).toEqual([]);
    expect(versionMismatchReasons(null, v)).toEqual([]);
  });

  it("flags codebook and ontology version drift independently", () => {
    expect(
      versionMismatchReasons(
        { codebookVersion: "1.2.0", ontologyVersion: "1.0.0" },
        { codebookVersion: "1.3.0", ontologyVersion: "1.0.0" },
      ),
    ).toEqual(["codebook_version_changed"]);
    expect(
      versionMismatchReasons(
        { codebookVersion: "1.3.0", ontologyVersion: "1.0.0" },
        { codebookVersion: "1.3.0", ontologyVersion: "1.1.0" },
      ),
    ).toEqual(["ontology_version_changed"]);
  });
});

describe("computeComparabilityWarnings", () => {
  it("flags a sample frame that changed by more than half (e.g. tripled)", () => {
    expect(computeComparabilityWarnings(summary(30000, 50), summary(10000, 50))).toEqual([
      "sample_frame_changed",
    ]);
  });
  it("does not flag a stable sample frame", () => {
    expect(computeComparabilityWarnings(summary(10500, 50), summary(10000, 50))).toEqual([]);
  });
});

describe("createComparisonPoint", () => {
  it("publishes a reliable delta for a stable, large, significant comparison", () => {
    const point = createComparisonPoint({
      ...base,
      kAnonymityMin: 5,
      current: summary(10000, 60),
      previous: summary(10200, 50),
    });
    expect(point.deltaFromPrevious).toBe(10);
    expect(point.suppressionReasons).toEqual([]);
    expect(point.comparabilityWarnings).toEqual([]);
    expect(point.reliability).toBe("reliable");
    expect(point.currentStatus).toBe("present");
  });

  it("HARD-suppresses the delta when the codebook version changed", () => {
    const point = createComparisonPoint({
      ...base,
      kAnonymityMin: 5,
      current: summary(10000, 60),
      previous: summary(10000, 50),
      versionMismatch: ["codebook_version_changed"],
    });
    expect(point.deltaFromPrevious).toBeNull();
    expect(point.suppressionReasons).toEqual(["codebook_version_changed"]);
    expect(point.currentStatus).toBe("suppressed");
    expect(point.reliability).toBe("suppressed");
  });

  it("keeps the delta but cautions when the sample frame shifted (tripled N)", () => {
    const point = createComparisonPoint({
      ...base,
      kAnonymityMin: 5,
      current: summary(30000, 60), // ~3x previous
      previous: summary(10000, 50),
    });
    expect(point.deltaFromPrevious).toBe(10); // value still shown
    expect(point.suppressionReasons).toEqual([]); // not hard-suppressed
    expect(point.comparabilityWarnings).toEqual(["sample_frame_changed"]);
    expect(point.reliability).toBe("caution");
  });

  it("suppresses with no_previous_period when there is no comparison", () => {
    const point = createComparisonPoint({
      ...base,
      kAnonymityMin: 5,
      previousPeriod: null,
      current: summary(10000, 60),
      previous: null,
      previousPresent: false,
    });
    expect(point.deltaFromPrevious).toBeNull();
    expect(point.suppressionReasons).toEqual(["no_previous_period"]);
    expect(point.reliability).toBe("suppressed");
  });

  it("suppresses when a sample is below the k-anonymity floor", () => {
    const point = createComparisonPoint({
      ...base,
      kAnonymityMin: 5,
      current: summary(3, 60),
      previous: summary(10000, 50),
    });
    expect(point.suppressionReasons).toContain("current_sample_below_k");
    expect(point.deltaFromPrevious).toBeNull();
  });
});
