import { describe, it, expect, vi, afterEach } from "vitest";
import { validateBriefConsistency } from "../lib/brief-consistency.js";

const matchingInput = {
  factoryRootBrief: {
    sourceToken: "2026-q2-de-05",
    capsuleId: "0198f000-0000-7000-8000-000000000000",
  },
  contractOntologyBrief: { period: "2026-q2", capsuleId: "0198f000-0000-7000-8000-000000000000" },
  observatoryBrief: { period: "2026-q2", capsuleId: "0198f000-0000-7000-8000-000000000000" },
  priorCapsulesExists: true,
  isFirstQuarter: false,
  priorCapsuleIds: ["0198faaa-0000-7000-8000-000000000000"],
};

describe("validateBriefConsistency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes when all briefs match", () => {
    expect(() => validateBriefConsistency(matchingInput)).not.toThrow();
  });

  it("throws on capsuleId mismatch between factory root and contract ontology", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        contractOntologyBrief: {
          period: "2026-q2",
          capsuleId: "0198faaa-0000-7000-8000-000000000000",
        },
      }),
    ).toThrow(/capsuleId mismatch/);
  });

  it("throws on capsuleId mismatch between factory root and observatory", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        observatoryBrief: { period: "2026-q2", capsuleId: "0198fbbb-0000-7000-8000-000000000000" },
      }),
    ).toThrow(/capsuleId mismatch/);
  });

  it("throws on period mismatch between sourceToken and contract ontology", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        contractOntologyBrief: {
          period: "2026-q3",
          capsuleId: "0198f000-0000-7000-8000-000000000000",
        },
      }),
    ).toThrow(/period mismatch/);
  });

  it("throws when prior-capsules.json is missing and not first quarter", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        priorCapsulesExists: false,
        isFirstQuarter: false,
      }),
    ).toThrow(/prior-capsules\.json not found/);
  });

  it("passes when prior-capsules.json is missing but first-quarter flag is set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        priorCapsulesExists: false,
        isFirstQuarter: true,
      }),
    ).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when prior-capsules.json exists but first-quarter flag is set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateBriefConsistency({
      ...matchingInput,
      priorCapsulesExists: true,
      isFirstQuarter: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("prior-capsules.json exists but --first-quarter is set"),
    );
  });

  it("throws PipelinePauseError when capsuleId collides with a prior quarter", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        priorCapsuleIds: ["0198f000-0000-7000-8000-000000000000"],
      }),
    ).toThrow(/already used by a prior quarter/);
  });

  it("passes when capsuleId differs from all prior quarters", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        priorCapsuleIds: [
          "0198faaa-0000-7000-8000-000000000000",
          "0198fbbb-0000-7000-8000-000000000000",
        ],
      }),
    ).not.toThrow();
  });

  it("passes when priorCapsuleIds is empty (first quarter)", () => {
    expect(() =>
      validateBriefConsistency({
        ...matchingInput,
        priorCapsuleIds: [],
      }),
    ).not.toThrow();
  });
});
