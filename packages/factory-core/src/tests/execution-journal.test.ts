import { describe, expect, it } from "vitest";
import { assertStageComplete, selectTerminalResult } from "../lib/execution-journal.js";

describe("execution journal", () => {
  it("selects the first valid success, then a final measured failure", () => {
    expect(selectTerminalResult([{ ordinal: 2, state: "succeeded", resultSha256: "b" }, { ordinal: 1, state: "succeeded", resultSha256: "a" }])).toEqual({ state: "succeeded", ordinal: 1 });
    expect(selectTerminalResult([{ ordinal: 1, state: "observed-failure" }, { ordinal: 2, state: "observed-failure" }])).toEqual({ state: "observed-failure", ordinal: 2 });
  });
  it("requires a complete non-quarantined target set to seal", () => {
    expect(() => assertStageComplete({ targetCount: 3, succeeded: 2, observedFailures: 1, approvedExclusions: 0, quarantined: 0 })).not.toThrow();
    expect(() => assertStageComplete({ targetCount: 3, succeeded: 2, observedFailures: 0, approvedExclusions: 0, quarantined: 0 })).toThrow();
  });
});
