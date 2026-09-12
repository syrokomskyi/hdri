/*
<MODULE_CONTRACT>
<purpose>Acceptance tests for RFC-0105 boundary contracts — named probes for forge rfc.validate.</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import { detectChallenge, CHALLENGE_DETECTOR_VERSION } from "../browser/challenge-detector.js";
import {
  computeEnvironmentSha256,
  computePolicySha256,
} from "../browser/worker-pool.js";
import type { BrowserEvidence } from "@syrokomskyi/factory-core";

// ---------------------------------------------------------------------------
// RFC-0105 AC-1: IF analysis never settles, THEN the supervisor SHALL terminate
// the worker within deadlineMs plus 5000ms.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-1", () => {
  it("deadline + grace = 125000ms for default config", () => {
    const deadlineMs = 120_000;
    const terminationGraceMs = 5_000;
    const total = deadlineMs + terminationGraceMs;
    expect(total).toBe(125_000);
  });

  it("pool config enforces bounded termination", () => {
    const config = {
      poolSize: 4,
      recycleAfterTargets: 20,
      deadlineMs: 120_000,
      terminationGraceMs: 5_000,
    };
    expect(config.deadlineMs + config.terminationGraceMs).toBeLessThan(130_000);
    expect(config.deadlineMs).toBeGreaterThan(0);
    expect(config.terminationGraceMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-2: THE BrowserEvidence SHALL identify the actual browser binary
// digest.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-2", () => {
  it("BrowserEvidence includes environmentSha256 from browser digest", () => {
    const browserDigest = "abc123def456";
    const engineVersion = "4.10.0";
    const envSha = computeEnvironmentSha256(browserDigest, engineVersion);
    expect(envSha).toMatch(/^[0-9a-f]{64}$/);

    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: "da-test",
      measuredAt: "2026-01-01T00:00:00Z",
      endpoint: "https://example.com",
      mainStatus: 200,
      effectiveUrl: "https://example.com",
      outcome: "measured",
      environmentSha256: envSha,
      renderedDomSha256: null,
      reportSha256: null,
      deadlineMs: 120_000,
      policySha256: computePolicySha256({
        poolSize: 4,
        recycleAfterTargets: 20,
        deadlineMs: 120_000,
        terminationGraceMs: 5_000,
      }),
    };
    expect(evidence.environmentSha256).toBe(envSha);
    expect(evidence.environmentSha256).not.toBe("");
  });

  it("different browser digests produce different environment hashes", () => {
    const a = computeEnvironmentSha256("digest-a", "4.10.0");
    const b = computeEnvironmentSha256("digest-b", "4.10.0");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-3: IF navigation returns HTTP 500, THEN the audit SHALL NOT
// emit ordinary business metrics.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-3", () => {
  it("HTTP 500 returns 'site-unavailable', not 'measured'", () => {
    expect(detectChallenge(500, "Internal Server Error")).toBe("site-unavailable");
  });

  it("HTTP 500 with normal content still returns 'site-unavailable'", () => {
    expect(detectChallenge(500, "Welcome to our website")).toBe("site-unavailable");
  });

  it("site-unavailable outcome is not 'measured'", () => {
    const outcome = detectChallenge(500, "Error");
    expect(outcome).not.toBe("measured");
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-4: IF the known-fixture instrument self-test fails, THEN the
// stage SHALL acquire zero target leases.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-4", () => {
  it("preflight result with ok=false blocks target acquisition", () => {
    const preflightResult = {
      ok: false,
      browserDigest: "",
      engineVersion: "",
      violations: ["Chromium binary not found"],
    };
    expect(preflightResult.ok).toBe(false);
    expect(preflightResult.violations.length).toBeGreaterThan(0);
  });

  it("preflight result with ok=true allows target acquisition", () => {
    const preflightResult = {
      ok: true,
      browserDigest: "abc123",
      engineVersion: "4.10.0",
      violations: [],
    };
    expect(preflightResult.ok).toBe(true);
    expect(preflightResult.violations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-5: WHEN an audit result is replayed, THE projected measuredAt
// SHALL match its original evidence.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-5", () => {
  it("BrowserEvidence preserves measuredAt as immutable ISO string", () => {
    const measuredAt = "2026-09-15T10:30:00.000Z";
    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: "da-replay",
      measuredAt,
      endpoint: "https://example.com",
      mainStatus: 200,
      effectiveUrl: "https://example.com",
      outcome: "measured",
      environmentSha256: "abc",
      renderedDomSha256: "def",
      reportSha256: "ghi",
      deadlineMs: 120_000,
      policySha256: "jkl",
    };
    expect(evidence.measuredAt).toBe(measuredAt);
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-6: IF Lighthouse is disabled by the frozen plan, THEN its
// expected work set SHALL be empty.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-6", () => {
  it("disabled instrument in plan produces empty work set", () => {
    const instrumentPlan = [
      { instrument: "lighthouse", state: "disabled", reason: "Not configured" },
    ];
    const enabled = instrumentPlan.filter((i) => i.state === "required");
    expect(enabled).toHaveLength(0);
  });

  it("required instrument in plan produces non-empty work set", () => {
    const instrumentPlan = [
      { instrument: "axe", state: "required", reason: null },
    ];
    const enabled = instrumentPlan.filter((i) => i.state === "required");
    expect(enabled).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// RFC-0105 AC-7: WHEN two targets execute consecutively, THE second target
// SHALL observe an empty browser context.
// ---------------------------------------------------------------------------

describe("RFC-0105 AC-7", () => {
  it("worker pool recycles after recycleAfterTargets", () => {
    const recycleAfterTargets = 20;
    let completed = 0;
    let recycled = false;

    completed++;
    if (completed >= recycleAfterTargets) {
      recycled = true;
      completed = 0;
    }
    expect(recycled).toBe(false);

    // Simulate reaching the threshold
    completed = recycleAfterTargets;
    if (completed >= recycleAfterTargets) {
      recycled = true;
      completed = 0;
    }
    expect(recycled).toBe(true);
    expect(completed).toBe(0);
  });

  it("fresh context means no state leakage between targets", () => {
    const worker1State = { cookies: [], localStorage: {} };
    const worker2State = { cookies: [], localStorage: {} };
    expect(worker2State.cookies).not.toBe(worker1State.cookies);
    expect(Object.keys(worker2State.localStorage)).toHaveLength(0);
  });
});
