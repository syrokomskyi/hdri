import { describe, expect, it } from "vitest";
import {
  assertHdriPeriod,
  assertRelativeArtifactUri,
  canonicalResumeKey,
  profileEligible,
  sourceOccurrenceId,
} from "../lib/quarter-contracts.js";

describe("quarter contracts", () => {
  it("accepts only canonical quarterly periods", () => {
    expect(() => assertHdriPeriod("2026-q3")).not.toThrow();
    expect(() => assertHdriPeriod("2026-h2")).toThrow();
  });

  it("gives a source occurrence a path-independent stable identity", () => {
    expect(sourceOccurrenceId("batch", "file", "record")).toBe(sourceOccurrenceId("batch", "file", "record"));
    expect(sourceOccurrenceId("batch", "file", "record")).not.toBe(sourceOccurrenceId("batch", "file", "other"));
  });

  it("uses unambiguous bytewise resume keys", () => {
    expect(canonicalResumeKey(["ab", "c"])).not.toBe(canonicalResumeKey(["a", "bc"]));
  });

  it("rejects host-specific or escaping artifact paths", () => {
    expect(() => assertRelativeArtifactUri("emit/part-1.ndjson")).not.toThrow();
    expect(() => assertRelativeArtifactUri("../q2.db")).toThrow();
    expect(() => assertRelativeArtifactUri("/tmp/q2.db")).toThrow();
  });

  it("admits profiles only after current reachability", () => {
    expect(profileEligible("reachable")).toBe(true);
    expect(profileEligible("unavailable")).toBe(false);
  });
});
