import { describe, it, expect } from "vitest";
import { evaluateProgramGate, ProgramGateSchema } from "../lib/program-gate.js";
import {
  parseAdmissionInput,
  verifyAdmissionInput,
  AdmissionInputSchema,
  type AdmissionInput,
  type AdmissionVerificationDeps,
  type EvidenceRef,
  type EvidenceVerificationResult,
} from "../lib/admission-input.js";

function makeEvidenceRef(overrides: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    schema: "test-evidence@1",
    uri: "evidence/test.json",
    bytes: 100,
    sha256: "0".repeat(64),
    ...overrides,
  };
}

function makeAdmissionInput(overrides: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    schema: AdmissionInputSchema,
    scope: {
      period: "2026-q3",
      capsuleId: "test-capsule",
      operation: "collect",
      implementationFingerprint: "test-fingerprint",
      policySha256: "0".repeat(64),
      evidenceClass: "fixture",
    },
    preservation: null,
    qualification: null,
    predecessor: null,
    capacity: null,
    publication: null,
    ...overrides,
  };
}

const fixtureDeps: AdmissionVerificationDeps = {
  verifyEvidenceRef: async (_ref, expected): Promise<EvidenceVerificationResult> => ({
    valid: true,
    keyClass: "fixture",
    scope: expected.scope,
  }),
  sha256: (_data: string) => "f".repeat(64),
};

const operationalDeps: AdmissionVerificationDeps = {
  verifyEvidenceRef: async (_ref, expected): Promise<EvidenceVerificationResult> => ({
    valid: true,
    keyClass: "operational",
    scope: expected.scope,
  }),
  sha256: (_data: string) => "a".repeat(64),
};

describe("ProgramGate (RFC-0113)", () => {
  it("blocks collect when no preservation receipt exists", async () => {
    const input = makeAdmissionInput();
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.status).toBe("blocked");
    expect(result.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });

  it("collect and publish are distinct — collection evidence does not authorize publish", async () => {
    const collectInput = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "collect" },
      preservation: makeEvidenceRef(),
      qualification: makeEvidenceRef(),
      predecessor: makeEvidenceRef(),
      capacity: makeEvidenceRef(),
    });
    const collectVerified = await verifyAdmissionInput(collectInput, fixtureDeps);
    const collectResult = evaluateProgramGate(collectVerified);
    expect(collectResult.status).toBe("allowed");
    expect(collectResult.operation).toBe("collect");

    const publishInput = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "publish" },
      preservation: makeEvidenceRef(),
      qualification: makeEvidenceRef(),
      publication: null,
    });
    const publishVerified = await verifyAdmissionInput(publishInput, fixtureDeps);
    const publishResult = evaluateProgramGate(publishVerified);
    expect(publishResult.status).toBe("blocked");
    expect(publishResult.blockerCodes).toContain("MISSING_PUBLICATION_READINESS");
    expect(publishResult.operation).toBe("publish");
  });

  it("preserve operation blocks without preservation receipt", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "preserve" },
      preservation: null,
    });
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.status).toBe("blocked");
    expect(result.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
  });

  it("preserve operation allows with preservation receipt", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "preserve" },
      preservation: makeEvidenceRef(),
    });
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.status).toBe("allowed");
  });

  it("publish allows when all three required refs are present", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "publish" },
      preservation: makeEvidenceRef(),
      qualification: makeEvidenceRef(),
      publication: makeEvidenceRef(),
    });
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.status).toBe("allowed");
    expect(result.blockerCodes).toHaveLength(0);
  });

  it("bootstrap state (all refs null) blocks collect and publish", async () => {
    const collectInput = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "collect" },
    });
    const collectVerified = await verifyAdmissionInput(collectInput, fixtureDeps);
    const collectResult = evaluateProgramGate(collectVerified);
    expect(collectResult.status).toBe("blocked");
    expect(collectResult.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
    expect(collectResult.blockerCodes).toContain("MISSING_COLLECTION_READINESS");

    const publishInput = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "publish" },
    });
    const publishVerified = await verifyAdmissionInput(publishInput, fixtureDeps);
    const publishResult = evaluateProgramGate(publishVerified);
    expect(publishResult.status).toBe("blocked");
    expect(publishResult.blockerCodes).toContain("MISSING_PRESERVATION_RECEIPT");
    expect(publishResult.blockerCodes).toContain("MISSING_COLLECTION_READINESS");
    expect(publishResult.blockerCodes).toContain("MISSING_PUBLICATION_READINESS");
  });

  it("returns the correct schema version", async () => {
    const input = makeAdmissionInput();
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.schema).toBe(ProgramGateSchema);
  });

  it("output includes inputFingerprint from verified input", async () => {
    const input = makeAdmissionInput({
      preservation: makeEvidenceRef(),
    });
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.inputFingerprint).toBe(verified.inputFingerprint);
    expect(typeof result.inputFingerprint).toBe("string");
  });

  it("output includes evidenceRefs for all non-null refs", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, operation: "publish" },
      preservation: makeEvidenceRef({ uri: "preservation.json" }),
      qualification: makeEvidenceRef({ uri: "qualification.json" }),
      predecessor: makeEvidenceRef({ uri: "predecessor.json" }),
      capacity: makeEvidenceRef({ uri: "capacity.json" }),
      publication: makeEvidenceRef({ uri: "publication.json" }),
    });
    const verified = await verifyAdmissionInput(input, fixtureDeps);
    const result = evaluateProgramGate(verified);
    expect(result.evidenceRefs).toHaveLength(5);
    expect(result.evidenceRefs.map((r) => r.uri)).toEqual([
      "preservation.json",
      "qualification.json",
      "predecessor.json",
      "capacity.json",
      "publication.json",
    ]);
  });
});

describe("parseAdmissionInput (RFC-0113)", () => {
  it("parses valid input with all evidence refs", () => {
    const raw = {
      schema: "hdri-admission-input@1",
      scope: {
        period: "2026-q3",
        capsuleId: "capsule-1",
        operation: "collect",
        implementationFingerprint: "fp-1",
        policySha256: "a".repeat(64),
        evidenceClass: "fixture",
      },
      preservation: { schema: "ev@1", uri: "p.json", bytes: 10, sha256: "b".repeat(64) },
      qualification: null,
      predecessor: null,
      capacity: null,
      publication: null,
    };
    const parsed = parseAdmissionInput(raw);
    expect(parsed.schema).toBe(AdmissionInputSchema);
    expect(parsed.scope.period).toBe("2026-q3");
    expect(parsed.preservation).not.toBeNull();
    expect(parsed.qualification).toBeNull();
  });

  it("rejects unknown schema", () => {
    expect(() => parseAdmissionInput({ schema: "wrong@1" })).toThrow(/unsupported schema/);
  });

  it("rejects unknown field", () => {
    const raw = {
      schema: "hdri-admission-input@1",
      scope: {
        period: "2026-q3",
        capsuleId: "c",
        operation: "collect",
        implementationFingerprint: "fp",
        policySha256: "a".repeat(64),
        evidenceClass: "fixture",
      },
      extraField: true,
    };
    expect(() => parseAdmissionInput(raw)).toThrow(/unknown field/);
  });

  it("rejects invalid period format", () => {
    const raw = {
      schema: "hdri-admission-input@1",
      scope: {
        period: "2026-q5",
        capsuleId: "c",
        operation: "collect",
        implementationFingerprint: "fp",
        policySha256: "a".repeat(64),
        evidenceClass: "fixture",
      },
    };
    expect(() => parseAdmissionInput(raw)).toThrow(/period/);
  });

  it("rejects invalid sha256 in evidence ref", () => {
    const raw = {
      schema: "hdri-admission-input@1",
      scope: {
        period: "2026-q3",
        capsuleId: "c",
        operation: "collect",
        implementationFingerprint: "fp",
        policySha256: "a".repeat(64),
        evidenceClass: "fixture",
      },
      preservation: { schema: "ev@1", uri: "p.json", bytes: 10, sha256: "short" },
    };
    expect(() => parseAdmissionInput(raw)).toThrow(/sha256/);
  });
});

describe("verifyAdmissionInput (RFC-0113)", () => {
  it("rejects evidence signed by wrong trust root for evidenceClass", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, evidenceClass: "operational" },
      preservation: makeEvidenceRef(),
    });
    const fixtureKeyDeps: AdmissionVerificationDeps = {
      verifyEvidenceRef: async () => ({ valid: true, keyClass: "fixture" }),
      sha256: () => "x".repeat(64),
    };
    await expect(verifyAdmissionInput(input, fixtureKeyDeps)).rejects.toThrow(
      /trust root mismatch/,
    );
  });

  it("accepts evidence when keyClass matches evidenceClass", async () => {
    const input = makeAdmissionInput({
      scope: { ...makeAdmissionInput().scope, evidenceClass: "operational" },
      preservation: makeEvidenceRef(),
    });
    const verified = await verifyAdmissionInput(input, operationalDeps);
    expect(verified.inputFingerprint).toBeDefined();
  });

  it("rejects when evidence verification fails", async () => {
    const input = makeAdmissionInput({
      preservation: makeEvidenceRef(),
    });
    const failingDeps: AdmissionVerificationDeps = {
      verifyEvidenceRef: async () => ({ valid: false, keyClass: null }),
      sha256: () => "y".repeat(64),
    };
    await expect(verifyAdmissionInput(input, failingDeps)).rejects.toThrow(/failed verification/);
  });
});
