import { describe, expect, it } from "vitest";
import { classifyLivenessOutcome, deriveAvailabilityTransition } from "../availability.js";

describe("website availability", () => {
  it("never calls a never-live source candidate dead", () => {
    expect(deriveAvailabilityTransition("candidate_never_live", "unavailable")).toEqual({ state: "candidate_never_live", event: null, carriesForward: false });
  });
  it("records only previously live disappearance and restoration", () => {
    expect(deriveAvailabilityTransition("active", "unavailable").event).toBe("website_became_unavailable");
    expect(deriveAvailabilityTransition("unavailable", "reachable").event).toBe("website_restored");
  });
  it("does not turn a blocked measurement into a transition", () => {
    expect(deriveAvailabilityTransition("active", "blocked")).toEqual({ state: "active", event: null, carriesForward: true });
  });
});

describe("raw liveness outcome policy", () => {
  it.each([401, 403, 429])("treats HTTP %s as blocked", (httpStatus) => {
    expect(classifyLivenessOutcome({ isLive: false, httpStatus, errorCode: null })).toBe("blocked");
  });

  it("separates collector failure from observed unavailability", () => {
    expect(classifyLivenessOutcome({ isLive: false, httpStatus: null, errorCode: "collector_crash" })).toBe("indeterminate");
    expect(classifyLivenessOutcome({ isLive: false, httpStatus: null, errorCode: "ENOTFOUND" })).toBe("unavailable");
  });
});
