import { describe, expect, it } from "vitest";
import { parsePriorCapsulesFile } from "@syrokomskyi/factory-core";

describe("prior-capsules.json parsing", () => {
  it("parses a valid prior-capsules.json with prior capsule entries", () => {
    const raw = JSON.stringify({
      schemaVersion: "1",
      currentPeriod: "2026-q3",
      priorCapsules: [
        {
          period: "2026-q2",
          capsuleId: "0198f000-0000-7000-8000-000000000000",
          manifestPath:
            "capsules/2026-q2/0198f000-0000-7000-8000-000000000000/capsule-manifest.json",
          sourceLedgerHead: "abc123",
          frameId: "frame-2026-q2",
          batchIds: ["2026-q2-de-01", "2026-q2-de-05"],
        },
      ],
    });
    const parsed = parsePriorCapsulesFile(raw);
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.currentPeriod).toBe("2026-q3");
    expect(parsed.priorCapsules).toHaveLength(1);
    expect(parsed.priorCapsules[0].batchIds).toEqual(["2026-q2-de-01", "2026-q2-de-05"]);
  });

  it("parses a valid prior-capsules.json with no prior capsules (first quarter)", () => {
    const raw = JSON.stringify({
      schemaVersion: "1",
      currentPeriod: "2026-q2",
      priorCapsules: [],
    });
    const parsed = parsePriorCapsulesFile(raw);
    expect(parsed.priorCapsules).toHaveLength(0);
  });

  it("rejects an invalid schemaVersion", () => {
    const raw = JSON.stringify({
      schemaVersion: "2",
      currentPeriod: "2026-q3",
      priorCapsules: [],
    });
    expect(() => parsePriorCapsulesFile(raw)).toThrow(/unsupported schemaVersion/);
  });

  it("rejects an invalid period", () => {
    const raw = JSON.stringify({
      schemaVersion: "1",
      currentPeriod: "invalid",
      priorCapsules: [],
    });
    expect(() => parsePriorCapsulesFile(raw)).toThrow(/Invalid HDRI period/);
  });

  it("rejects an invalid capsuleId", () => {
    const raw = JSON.stringify({
      schemaVersion: "1",
      currentPeriod: "2026-q3",
      priorCapsules: [
        {
          period: "2026-q2",
          capsuleId: "not-a-uuid",
          manifestPath: "some-path.json",
          sourceLedgerHead: "abc",
          frameId: "frame-2026-q2",
          batchIds: [],
        },
      ],
    });
    expect(() => parsePriorCapsulesFile(raw)).toThrow(/UUID v7/);
  });
});
