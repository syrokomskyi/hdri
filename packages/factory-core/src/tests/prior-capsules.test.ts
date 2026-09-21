import { describe, expect, it } from "vitest";
import { parsePriorCapsulesFile } from "../lib/prior-capsules.js";

describe("parsePriorCapsulesFile", () => {
  const validEntry = {
    period: "2026-q2",
    capsuleId: "0198f000-0000-7000-8000-000000000000",
    manifestPath: "capsules/2026-q2/0198f000-0000-7000-8000-000000000000/capsule-manifest.json",
    sourceLedgerHead: "abc123",
    frameId: "frame-2026-q2",
    batchIds: ["2026-q2-de-01", "2026-q2-de-05"],
  };

  const makeFile = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: "1",
    currentPeriod: "2026-q3",
    priorCapsules: [validEntry],
    ...overrides,
  });

  it("parses a valid file with prior capsule entries", () => {
    const parsed = parsePriorCapsulesFile(JSON.stringify(makeFile()));
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.currentPeriod).toBe("2026-q3");
    expect(parsed.priorCapsules).toHaveLength(1);
    expect(parsed.priorCapsules[0].batchIds).toEqual(["2026-q2-de-01", "2026-q2-de-05"]);
  });

  it("parses a file with no prior capsules (first quarter)", () => {
    const parsed = parsePriorCapsulesFile(
      JSON.stringify({ schemaVersion: "1", currentPeriod: "2026-q2", priorCapsules: [] }),
    );
    expect(parsed.priorCapsules).toHaveLength(0);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() =>
      parsePriorCapsulesFile(JSON.stringify(makeFile({ schemaVersion: "2" }))),
    ).toThrow(/unsupported schemaVersion/);
  });

  it("rejects invalid currentPeriod", () => {
    expect(() =>
      parsePriorCapsulesFile(JSON.stringify(makeFile({ currentPeriod: "invalid" }))),
    ).toThrow(/Invalid HDRI period/);
  });

  it("rejects non-array priorCapsules", () => {
    expect(() =>
      parsePriorCapsulesFile(JSON.stringify(makeFile({ priorCapsules: "not-an-array" }))),
    ).toThrow(/must be an array/);
  });

  it("rejects invalid capsuleId", () => {
    const bad = makeFile({
      priorCapsules: [{ ...validEntry, capsuleId: "not-a-uuid" }],
    });
    expect(() => parsePriorCapsulesFile(JSON.stringify(bad))).toThrow(/UUID v7/);
  });

  it("rejects empty manifestPath", () => {
    const bad = makeFile({
      priorCapsules: [{ ...validEntry, manifestPath: "" }],
    });
    expect(() => parsePriorCapsulesFile(JSON.stringify(bad))).toThrow(/manifestPath/);
  });

  it("rejects invalid period in prior capsule entry", () => {
    const bad = makeFile({
      priorCapsules: [{ ...validEntry, period: "2026-q5" }],
    });
    expect(() => parsePriorCapsulesFile(JSON.stringify(bad))).toThrow(/Invalid HDRI period/);
  });

  it("rejects non-string frameId", () => {
    const bad = makeFile({
      priorCapsules: [{ ...validEntry, frameId: 123 }],
    });
    expect(() => parsePriorCapsulesFile(JSON.stringify(bad))).toThrow(/frameId/);
  });

  it("rejects non-string sourceLedgerHead", () => {
    const bad = makeFile({
      priorCapsules: [{ ...validEntry, sourceLedgerHead: null }],
    });
    expect(() => parsePriorCapsulesFile(JSON.stringify(bad))).toThrow(/sourceLedgerHead/);
  });
});
