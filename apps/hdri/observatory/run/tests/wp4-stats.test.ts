/**
 * WP4: additive statistical rigor for cross-quarter trends.
 * - bootstrapMeanCI: deterministic, significance via CI excluding 0.
 * - panel-core: like-for-like (matched asset) delta, composition-robust.
 * - poststrat-core: population-weighted headline mean, frame-gated.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bootstrapMeanCI, mean, median } from "../../tools/stats-core";
import { computePanelPoint, buildPanelTrends } from "../../tools/panel-core";
import {
  postStratifiedMean,
  buildPostStratTrends,
  loadPopulationFrame,
  type PopulationFrame,
} from "../../tools/poststrat-core";

// ── stats-core ───────────────────────────────────────────────────────────────

describe("bootstrapMeanCI", () => {
  it("is deterministic for a fixed seed", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(bootstrapMeanCI(xs)).toEqual(bootstrapMeanCI(xs));
  });

  it("flags a clearly positive shift as significant (CI excludes 0)", () => {
    const ci = bootstrapMeanCI(Array.from({ length: 50 }, () => 10));
    expect(ci.significant).toBe(true);
    expect(ci.lo).toBeGreaterThan(0);
  });

  it("does not flag a centered-on-zero sample as significant", () => {
    const xs = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? -5 : 5));
    const ci = bootstrapMeanCI(xs);
    expect(ci.significant).toBe(false);
    expect(ci.lo).toBeLessThanOrEqual(0);
    expect(ci.hi).toBeGreaterThanOrEqual(0);
  });

  it("handles empty and singleton samples", () => {
    expect(bootstrapMeanCI([]).significant).toBe(false);
    expect(bootstrapMeanCI([7])).toMatchObject({ mean: 7, lo: 7, hi: 7, significant: false });
  });

  it("mean and median helpers", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
  });
});

// ── panel-core ───────────────────────────────────────────────────────────────

const scoresMap = (entries: Array<[string, number]>): Map<string, number> => new Map(entries);

describe("panel-core", () => {
  it("computes the like-for-like change over the matched intersection only", () => {
    const previous = scoresMap([
      ["a", 50],
      ["b", 60],
      ["c", 40],
    ]);
    const current = scoresMap([
      ["a", 60], // +10
      ["b", 65], // +5
      ["d", 90], // new asset, not in panel
    ]);
    const p = computePanelPoint({
      period: "2026-q3",
      previousPeriod: "2026-q2",
      current,
      previous,
      kAnonymityMin: 2,
    });
    expect(p.nPanel).toBe(2); // a, b
    expect(p.nCurrent).toBe(3);
    expect(p.meanChange).toBe(7.5); // (10 + 5) / 2
    expect(p.coverage).toBeCloseTo(0.67, 1);
  });

  it("is robust to a tripled, lower-scoring new cohort (composition immunity)", () => {
    // Same 40 businesses each improve by +6; the current period also adds 80 new
    // low-scoring businesses. A cross-sectional mean would fall; the panel sees +6.
    const previous = new Map<string, number>();
    const current = new Map<string, number>();
    for (let i = 0; i < 40; i++) {
      previous.set(`old-${i}`, 50);
      current.set(`old-${i}`, 56);
    }
    for (let i = 0; i < 80; i++) current.set(`new-${i}`, 20);

    const p = computePanelPoint({
      period: "2026-q3",
      previousPeriod: "2026-q2",
      current,
      previous,
      kAnonymityMin: 5,
    });
    expect(p.nPanel).toBe(40);
    expect(p.meanChange).toBe(6);
    expect(p.significant).toBe(true);
    expect(p.reliability).toBe("reliable");
    expect(p.coverage).toBeCloseTo(0.33, 1); // 40 / 120
  });

  it("suppresses a panel below the k-anonymity floor", () => {
    const p = computePanelPoint({
      period: "2026-q3",
      previousPeriod: "2026-q2",
      current: scoresMap([["a", 60]]),
      previous: scoresMap([["a", 50]]),
      kAnonymityMin: 5,
    });
    expect(p.suppressed).toBe(true);
    expect(p.meanChange).toBeNull();
    expect(p.reliability).toBe("suppressed");
  });

  it("buildPanelTrends yields one point per adjacent pair", () => {
    const series = [
      { period: "2026-q2", scores: scoresMap([["a", 50]]) },
      { period: "2026-q3", scores: scoresMap([["a", 55]]) },
      { period: "2026-q4", scores: scoresMap([["a", 58]]) },
    ];
    const trends = buildPanelTrends(series, 5);
    expect(trends.map((t) => `${t.previousPeriod}->${t.period}`)).toEqual([
      "2026-q2->2026-q3",
      "2026-q3->2026-q4",
    ]);
  });
});

// ── poststrat-core ───────────────────────────────────────────────────────────

const frame: PopulationFrame = {
  strataSystem: "bundesland|destatis_group",
  source: "test",
  weights: { "Bayern|III": 70, "Hessen|III": 30 },
};

describe("poststrat-core", () => {
  it("reweights stratum means to the population frame (fixes composition)", () => {
    // Sample over-represents Hessen, but the frame says Bayern is 70%.
    const assets = [
      { stratumKey: "Bayern|III", score: 80 },
      { stratumKey: "Hessen|III", score: 40 },
      { stratumKey: "Hessen|III", score: 40 },
      { stratumKey: "Hessen|III", score: 40 },
    ];
    const r = postStratifiedMean(assets, frame);
    // 0.7*80 + 0.3*40 = 68 (not the naive sample mean of 50)
    expect(r.weightedMean).toBe(68);
    expect(r.weightCoverage).toBe(1);
    expect(r.coveredStrata).toBe(2);
  });

  it("ignores strata absent from the frame and reports coverage", () => {
    const assets = [
      { stratumKey: "Bayern|III", score: 80 },
      { stratumKey: "Berlin|VII", score: 10 }, // not in frame
    ];
    const r = postStratifiedMean(assets, frame);
    expect(r.weightedMean).toBe(80); // only Bayern covered → its mean
    expect(r.weightCoverage).toBeCloseTo(0.7, 5); // 70 of 100 frame weight
  });

  it("suppresses periods with insufficient frame coverage", () => {
    const thin = [{ period: "2026-q2", assets: [{ stratumKey: "Hessen|III", score: 40 }] }];
    const [pt] = buildPostStratTrends(thin, frame);
    expect(pt!.suppressed).toBe(true); // only 30% coverage < 0.6
    expect(pt!.weightedMean).toBeNull();
  });
});

describe("loadPopulationFrame", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no frame file exists", async () => {
    expect(await loadPopulationFrame(dir)).toBeNull();
  });

  it("treats the all-zero template as absent (no fabricated output)", async () => {
    const zero = {
      strataSystem: "bundesland|destatis_group",
      source: "x",
      weights: { "Bayern|III": 0, "Hessen|III": 0 },
    };
    fs.writeFileSync(path.join(dir, "population-frame.json"), JSON.stringify(zero));
    expect(await loadPopulationFrame(dir)).toBeNull();
  });

  it("loads a frame with positive weights", async () => {
    const f = {
      strataSystem: "bundesland|destatis_group",
      source: "real",
      weights: { "Bayern|III": 70 },
    };
    fs.writeFileSync(path.join(dir, "population-frame.json"), JSON.stringify(f));
    const loaded = await loadPopulationFrame(dir);
    expect(loaded?.weights["Bayern|III"]).toBe(70);
  });
});
