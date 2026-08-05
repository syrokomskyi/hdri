import { describe, expect, it } from "vitest";
import { parseBriefMarkdown } from "../brief.js";

const VALID_BRIEF = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: []
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
  - instrument: lighthouse
    state: disabled
    reason: "Not configured for Q3 2026"
---
`;

const BRIEF_NO_PLAN = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: []
---
`;

const BRIEF_ALL_REQUIRED = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: []
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
  - instrument: lighthouse
    state: required
    reason: null
---
`;

describe("a-contract-ontology brief parser", () => {
  it("parses a valid brief with instrumentPlan", () => {
    const brief = parseBriefMarkdown(VALID_BRIEF);
    expect(brief.instrumentPlan).toHaveLength(4);
    expect(brief.instrumentPlan[0].instrument).toBe("liveness");
    expect(brief.instrumentPlan[0].state).toBe("required");
    expect(brief.instrumentPlan[3].instrument).toBe("lighthouse");
    expect(brief.instrumentPlan[3].state).toBe("disabled");
    expect(brief.instrumentPlan[3].reason).toBe("Not configured for Q3 2026");
  });

  it("defaults to Lighthouse disabled when instrumentPlan omitted", () => {
    const brief = parseBriefMarkdown(BRIEF_NO_PLAN);
    expect(brief.instrumentPlan).toHaveLength(4);
    const lighthouse = brief.instrumentPlan.find((e) => e.instrument === "lighthouse");
    expect(lighthouse).toBeDefined();
    expect(lighthouse!.state).toBe("disabled");
  });

  it("accepts all instruments as required", () => {
    const brief = parseBriefMarkdown(BRIEF_ALL_REQUIRED);
    const lighthouse = brief.instrumentPlan.find((e) => e.instrument === "lighthouse");
    expect(lighthouse!.state).toBe("required");
    expect(lighthouse!.reason).toBeNull();
  });

  it("rejects required instrument in skipGogols", () => {
    const conflicting = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: ["5-audit-axe"]
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
  - instrument: lighthouse
    state: disabled
    reason: "Not configured"
---
`;
    expect(() => parseBriefMarkdown(conflicting)).toThrow(/required.*skipGogols/);
  });

  it("allows disabled instrument in skipGogols", () => {
    const ok = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: ["4-audit-lighthouse"]
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
  - instrument: lighthouse
    state: disabled
    reason: "Not configured"
---
`;
    expect(() => parseBriefMarkdown(ok)).not.toThrow();
  });

  it("rejects invalid instrumentPlan with missing entry", () => {
    const missing = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"
skipGogols: []
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
---
`;
    expect(() => parseBriefMarkdown(missing)).toThrow(/missing entry for: lighthouse/);
  });
});
