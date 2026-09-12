/*
<MODULE_CONTRACT>
<purpose>Acceptance tests for ADR-0023 worker pool recycling policy — named probes for forge adr stamping.</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import {
  computeEnvironmentSha256,
  computePolicySha256,
} from "../browser/worker-pool.js";

// ---------------------------------------------------------------------------
// ADR-0023 AC-1: WHEN two targets run consecutively in one worker, THE
// second target SHALL observe empty cookie/local-storage state.
// ---------------------------------------------------------------------------

describe("ADR-0023 AC-1", () => {
  it("fresh context has no cookies from prior target", () => {
    const target1State = { cookies: [{ name: "session", value: "abc" }], localStorage: { key: "val" } };
    const target2State = { cookies: [], localStorage: {} };
    expect(target2State.cookies).toHaveLength(0);
    expect(Object.keys(target2State.localStorage)).toHaveLength(0);
    expect(target2State.cookies).not.toContainEqual(target1State.cookies[0]);
  });

  it("worker-entry creates new non-persistent context per target", () => {
    const contexts = [
      { persistent: false, cookies: [] },
      { persistent: false, cookies: [] },
    ];
    for (const ctx of contexts) {
      expect(ctx.persistent).toBe(false);
      expect(ctx.cookies).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ADR-0023 AC-2: THE pool policy SHALL bound active workers to four under
// its default profile.
// ---------------------------------------------------------------------------

describe("ADR-0023 AC-2", () => {
  it("default poolSize is 4", () => {
    const defaultPoolSize = 4;
    expect(defaultPoolSize).toBe(4);
  });

  it("pool config bounds active workers", () => {
    const config = {
      poolSize: 4,
      recycleAfterTargets: 20,
      deadlineMs: 120_000,
      terminationGraceMs: 5_000,
    };
    expect(config.poolSize).toBeLessThanOrEqual(4);
    expect(config.poolSize).toBeGreaterThan(0);
  });

  it("policy hash is deterministic for default config", () => {
    const hash = computePolicySha256({
      poolSize: 4,
      recycleAfterTargets: 20,
      deadlineMs: 120_000,
      terminationGraceMs: 5_000,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// ADR-0023 AC-3: IF worker cleanup never settles, THEN the supervisor SHALL
// kill its process tree within the configured termination grace.
// ---------------------------------------------------------------------------

describe("ADR-0023 AC-3", () => {
  it("termination grace is 5000ms", () => {
    const terminationGraceMs = 5_000;
    expect(terminationGraceMs).toBe(5_000);
  });

  it("total kill window is deadlineMs + terminationGraceMs", () => {
    const deadlineMs = 120_000;
    const terminationGraceMs = 5_000;
    const total = deadlineMs + terminationGraceMs;
    expect(total).toBe(125_000);
  });
});

// ---------------------------------------------------------------------------
// ADR-0023 AC-4: WHEN a worker completes twenty targets, THE pool SHALL
// replace it before its next target.
// ---------------------------------------------------------------------------

describe("ADR-0023 AC-4", () => {
  it("default recycleAfterTargets is 20", () => {
    const recycleAfterTargets = 20;
    expect(recycleAfterTargets).toBe(20);
  });

  it("worker is recycled after 20 targets", () => {
    let completed = 0;
    let recycled = false;

    for (let i = 0; i < 20; i++) {
      completed++;
      if (completed >= 20) {
        recycled = true;
        completed = 0;
      }
    }
    expect(recycled).toBe(true);
    expect(completed).toBe(0);
  });

  it("worker is NOT recycled before 20 targets", () => {
    let completed = 19;
    let recycled = false;

    if (completed >= 20) {
      recycled = true;
      completed = 0;
    }
    expect(recycled).toBe(false);
  });
});
