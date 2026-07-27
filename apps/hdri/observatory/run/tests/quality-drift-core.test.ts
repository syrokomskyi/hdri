/**
 * Finding 8: data-quality drift gate. Proves the pure driftFindings thresholds fire (and
 * stay quiet) as intended, and that computePeriodQuality reads the vitals off a real DB.
 */

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  computePeriodQuality,
  driftFindings,
  DEFAULT_DRIFT_THRESHOLDS,
  type PeriodQuality,
} from "../../tools/quality-drift-core";

const base = (over: Partial<PeriodQuality>): PeriodQuality => ({
  runId: "r",
  period: "2026-Q2",
  n: 1000,
  meanScore: 50,
  medianScore: 50,
  closedThisPeriod: 50,
  deadShare: 0.05,
  comparabilityKey: "m1",
  ...over,
});

describe("driftFindings — score distribution", () => {
  it("stays silent for ordinary movement", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", meanScore: 50 }),
      base({ period: "2026-Q3", meanScore: 53 }),
    ]);
    expect(f.filter((x) => x.check === "score-distribution-drift")).toEqual([]);
  });

  it("errors on a large shift under identical methodology", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", meanScore: 50, comparabilityKey: "m1" }),
      base({ period: "2026-Q3", meanScore: 65, comparabilityKey: "m1" }),
    ]);
    const d = f.find((x) => x.check === "score-distribution-drift");
    expect(d?.severity).toBe("ERROR");
  });

  it("does NOT flag score drift across a methodology change (legitimate reweighting)", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", meanScore: 50, comparabilityKey: "m1" }),
      base({ period: "2026-Q3", meanScore: 65, comparabilityKey: "m2" }),
    ]);
    expect(f.filter((x) => x.check === "score-distribution-drift")).toEqual([]);
  });
});

describe("driftFindings — sample size & dead-domain (methodology-independent)", () => {
  it("errors when the scored sample collapses even across a methodology change", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", n: 1000, comparabilityKey: "m1" }),
      base({ period: "2026-Q3", n: 500, comparabilityKey: "m2" }),
    ]);
    const d = f.find((x) => x.check === "sample-size-drift");
    expect(d?.severity).toBe("ERROR");
  });

  it("warns on a moderate sample drop", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", n: 1000 }),
      base({ period: "2026-Q3", n: 820 }),
    ]);
    const d = f.find((x) => x.check === "sample-size-drift");
    expect(d?.severity).toBe("WARN");
  });

  it("errors on a dead-domain-share spike", () => {
    const f = driftFindings([
      base({ period: "2026-Q2", deadShare: 0.05 }),
      base({ period: "2026-Q3", deadShare: 0.35 }),
    ]);
    const d = f.find((x) => x.check === "dead-domain-drift");
    expect(d?.severity).toBe("ERROR");
  });
});

describe("computePeriodQuality over a real DB", () => {
  it("computes N, mean, median and dead-domain share", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE scores (id TEXT, asset_id TEXT, run_id TEXT, overall_score REAL);
      CREATE TABLE asset_lifecycle_events (event_id TEXT, asset_id TEXT, event_type TEXT, period TEXT);
    `);
    const insS = db.prepare("INSERT INTO scores VALUES (?,?,?,?)");
    // scores 10,20,30,40,50 → mean 30, median 30, N 5. Plus one NULL (excluded).
    [10, 20, 30, 40, 50].forEach((v, i) => insS.run(`s${i}`, `a${i}`, "run-1", v));
    insS.run("s-null", "a-null", "run-1", null);
    db.prepare("INSERT INTO asset_lifecycle_events VALUES (?,?,?,?)").run(
      "e1",
      "a0",
      "closed",
      "2026-Q2",
    );

    const q = computePeriodQuality(db, {
      run_id: "run-1",
      period: "2026-Q2",
      comparabilityKey: "m1",
    });
    expect(q.n).toBe(5);
    expect(q.meanScore).toBe(30);
    expect(q.medianScore).toBe(30);
    expect(q.closedThisPeriod).toBe(1);
    expect(q.deadShare).toBeCloseTo(0.2, 6);
    db.close();
  });
});

it("thresholds are the documented defaults", () => {
  expect(DEFAULT_DRIFT_THRESHOLDS.meanShiftError).toBe(12);
});
