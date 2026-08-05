import { describe, expect, it } from "vitest";
import {
  capsuleConfigSha256,
  DEFAULT_INSTRUMENT_PLAN,
  KNOWN_INSTRUMENTS,
  parseInstrumentPlanFromFrontmatter,
  validateInstrumentPlan,
} from "../lib/quarter-contracts.js";
import type { InstrumentPlanEntry } from "../lib/capsule.js";

const validPlan: InstrumentPlanEntry[] = [
  { instrument: "liveness", state: "required", reason: null },
  { instrument: "profile", state: "required", reason: null },
  { instrument: "axe", state: "required", reason: null },
  { instrument: "lighthouse", state: "disabled", reason: "Not configured" },
];

describe("KNOWN_INSTRUMENTS", () => {
  it("contains all four instruments", () => {
    expect(KNOWN_INSTRUMENTS).toEqual(["liveness", "profile", "axe", "lighthouse"]);
  });
});

describe("DEFAULT_INSTRUMENT_PLAN", () => {
  it("has lighthouse disabled with a reason", () => {
    const lighthouse = DEFAULT_INSTRUMENT_PLAN.find((e) => e.instrument === "lighthouse");
    expect(lighthouse).toBeDefined();
    expect(lighthouse!.state).toBe("disabled");
    expect(lighthouse!.reason).toBeTruthy();
  });

  it("has liveness, profile, axe as required", () => {
    for (const id of ["liveness", "profile", "axe"] as const) {
      const entry = DEFAULT_INSTRUMENT_PLAN.find((e) => e.instrument === id);
      expect(entry).toBeDefined();
      expect(entry!.state).toBe("required");
      expect(entry!.reason).toBeNull();
    }
  });
});

describe("validateInstrumentPlan", () => {
  it("accepts a valid plan", () => {
    expect(() => validateInstrumentPlan(validPlan)).not.toThrow();
  });

  it("accepts the default plan", () => {
    expect(() => validateInstrumentPlan(DEFAULT_INSTRUMENT_PLAN)).not.toThrow();
  });

  it("rejects missing instrument", () => {
    const incomplete = validPlan.filter((e) => e.instrument !== "lighthouse");
    expect(() => validateInstrumentPlan(incomplete)).toThrow(/missing entry for: lighthouse/);
  });

  it("rejects duplicate instrument", () => {
    const dup: InstrumentPlanEntry[] = [
      ...validPlan,
      { instrument: "liveness", state: "required", reason: null },
    ];
    expect(() => validateInstrumentPlan(dup)).toThrow(/Duplicate instrument/);
  });

  it("rejects unknown instrument", () => {
    const unknown = [
      ...validPlan,
      { instrument: "unknown", state: "required", reason: null },
    ] as unknown as InstrumentPlanEntry[];
    expect(() => validateInstrumentPlan(unknown)).toThrow(/Unknown instrument/);
  });

  it("rejects disabled without reason", () => {
    const noReason = validPlan.map((e) =>
      e.instrument === "lighthouse" ? { ...e, reason: "" } : e,
    );
    expect(() => validateInstrumentPlan(noReason)).toThrow(
      /Disabled instrument requires non-empty reason/,
    );
  });

  it("rejects required with non-null reason", () => {
    const withReason = validPlan.map((e) =>
      e.instrument === "liveness" ? { ...e, reason: "should be null" } : e,
    );
    expect(() => validateInstrumentPlan(withReason)).toThrow(
      /Required instrument must have null reason/,
    );
  });

  it("rejects invalid state", () => {
    const badState = validPlan.map((e) =>
      e.instrument === "liveness" ? { ...e, state: "optional" } : e,
    ) as unknown as InstrumentPlanEntry[];
    expect(() => validateInstrumentPlan(badState)).toThrow(/Invalid instrument state/);
  });
});

describe("parseInstrumentPlanFromFrontmatter", () => {
  it("returns default plan when undefined", () => {
    const plan = parseInstrumentPlanFromFrontmatter(undefined);
    expect(plan).toHaveLength(4);
    expect(plan[3].instrument).toBe("lighthouse");
    expect(plan[3].state).toBe("disabled");
  });

  it("returns default plan when null", () => {
    const plan = parseInstrumentPlanFromFrontmatter(null);
    expect(plan).toHaveLength(4);
  });

  it("parses a valid plan from frontmatter", () => {
    const raw = [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "disabled", reason: "No budget" },
    ];
    const plan = parseInstrumentPlanFromFrontmatter(raw);
    expect(plan).toHaveLength(4);
    expect(plan[3].reason).toBe("No budget");
  });

  it("throws on non-array input", () => {
    expect(() => parseInstrumentPlanFromFrontmatter("not an array")).toThrow(/must be an array/);
  });

  it("throws on entry that is not an object", () => {
    expect(() => parseInstrumentPlanFromFrontmatter(["not an object"])).toThrow(
      /must be an object/,
    );
  });

  it("throws on invalid state value", () => {
    const raw = [
      { instrument: "liveness", state: "maybe", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "disabled", reason: "x" },
    ];
    expect(() => parseInstrumentPlanFromFrontmatter(raw)).toThrow(/state must be/);
  });
});

describe("capsuleConfigSha256", () => {
  it("produces different hashes for different instrument plans", () => {
    const planA: InstrumentPlanEntry[] = [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "disabled", reason: "A" },
    ];
    const planB: InstrumentPlanEntry[] = [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "disabled", reason: "B" },
    ];
    const hashA = capsuleConfigSha256("2026-q3", "0198f000-0000-7000-8000-000000000000", planA);
    const hashB = capsuleConfigSha256("2026-q3", "0198f000-0000-7000-8000-000000000000", planB);
    expect(hashA).not.toBe(hashB);
  });

  it("produces same hash for same plan", () => {
    const h1 = capsuleConfigSha256("2026-q3", "0198f000-0000-7000-8000-000000000000", validPlan);
    const h2 = capsuleConfigSha256("2026-q3", "0198f000-0000-7000-8000-000000000000", validPlan);
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different periods", () => {
    const h1 = capsuleConfigSha256("2026-q3", "0198f000-0000-7000-8000-000000000000", validPlan);
    const h2 = capsuleConfigSha256("2026-q4", "0198f000-0000-7000-8000-000000000000", validPlan);
    expect(h1).not.toBe(h2);
  });
});

describe("EmitBundleGogol plan derivation logic", () => {
  it("uses default plan when brief has no instrumentPlan", () => {
    const briefInstrumentPlan: InstrumentPlanEntry[] | undefined = undefined;
    const instrumentPlan = briefInstrumentPlan ?? DEFAULT_INSTRUMENT_PLAN;
    expect(instrumentPlan).toBe(DEFAULT_INSTRUMENT_PLAN);
    const lighthouse = instrumentPlan.find((e) => e.instrument === "lighthouse");
    expect(lighthouse!.state).toBe("disabled");
  });

  it("uses brief plan when provided", () => {
    const briefPlan: InstrumentPlanEntry[] = [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "required", reason: null },
    ];
    const instrumentPlan = briefPlan ?? DEFAULT_INSTRUMENT_PLAN;
    expect(instrumentPlan).toBe(briefPlan);
    const lighthouse = instrumentPlan.find((e) => e.instrument === "lighthouse");
    expect(lighthouse!.state).toBe("required");
  });

  it("derives requiredStages from instrumentPlan (default: liveness, profile, axe)", () => {
    const instrumentPlan = DEFAULT_INSTRUMENT_PLAN;
    const requiredStages = instrumentPlan
      .filter((entry) => entry.state === "required")
      .map((entry) => entry.instrument);
    expect(requiredStages).toEqual(["liveness", "profile", "axe"]);
  });

  it("derives requiredStages from instrumentPlan (all required)", () => {
    const allRequired: InstrumentPlanEntry[] = [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "required", reason: null },
    ];
    const requiredStages = allRequired
      .filter((entry) => entry.state === "required")
      .map((entry) => entry.instrument);
    expect(requiredStages).toEqual(["liveness", "profile", "axe", "lighthouse"]);
  });
});
