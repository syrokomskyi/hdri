import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createBootstrapAdmission,
  parseAdmissionInput,
  verifyAdmissionInput,
  type AdmissionInput,
  type AdmissionVerificationDeps,
  type EvidenceScope,
} from "../lib/admission-input.js";
import { evaluateProgramGate } from "../lib/program-gate.js";

const scope: EvidenceScope = {
  period: "2026-q4",
  capsuleId: "capsule-four",
  operation: "collect",
  implementationFingerprint: "a".repeat(64),
  policySha256: "b".repeat(64),
  evidenceClass: "operational",
};
const ref = (name: string) => ({
  schema: "admission-evidence@1",
  uri: `${name}.json`,
  bytes: 100,
  sha256: "c".repeat(64),
});
const input = (): AdmissionInput => ({
  schema: "hdri-admission-input@1",
  scope: { ...scope },
  preservation: ref("preservation"),
  qualification: ref("qualification"),
  predecessor: ref("predecessor"),
  capacity: ref("capacity"),
  publication: null,
});
const deps: AdmissionVerificationDeps = {
  verifyEvidenceRef: async () => ({ valid: true, keyClass: "operational", scope: { ...scope } }),
  sha256: (data) => createHash("sha256").update(data).digest("hex"),
};

describe("instance-bound admission authority", () => {
  it.each([
    ["period", "2026-q3"],
    ["capsuleId", "another-capsule"],
    ["operation", "publish"],
    ["implementationFingerprint", "d".repeat(64)],
    ["policySha256", "e".repeat(64)],
    ["evidenceClass", "fixture"],
  ])("rejects authentic evidence with a different %s", async (field, value) => {
    await expect(
      verifyAdmissionInput(input(), {
        ...deps,
        verifyEvidenceRef: async () => ({
          valid: true,
          keyClass: "operational",
          scope: { ...scope, [field]: value },
        }),
      }),
    ).rejects.toThrow("authenticated scope mismatch");
  });

  it("cannot treat a boolean signature result as scoped evidence", async () => {
    await expect(
      verifyAdmissionInput(input(), {
        ...deps,
        verifyEvidenceRef: async () => ({ valid: true, keyClass: "operational" }),
      }),
    ).rejects.toThrow("authenticated scope mismatch");
  });

  it("rejects authority copied from a genuine verified object or bootstrap", async () => {
    const verified = await verifyAdmissionInput(input(), deps);
    expect(evaluateProgramGate(verified).status).toBe("allowed");
    expect(() => evaluateProgramGate({ ...verified })).toThrow("UNVERIFIED_ADMISSION_INPUT");
    const bootstrap = createBootstrapAdmission({
      period: scope.period,
      capsuleId: scope.capsuleId,
      operation: "collect",
    });
    expect(() =>
      evaluateProgramGate({ ...bootstrap, preservation: ref("p"), qualification: ref("q") }),
    ).toThrow("UNVERIFIED_ADMISSION_INPUT");
  });

  it("freezes verified authority and detaches all mutable caller references", async () => {
    const requested = input();
    const verified = await verifyAdmissionInput(requested, deps);
    requested.scope.period = "2027-q1";
    requested.preservation!.sha256 = "f".repeat(64);
    expect(verified.scope).toEqual(scope);
    expect(verified.preservation!.sha256).toBe("c".repeat(64));
    expect(() => {
      verified.scope.period = "2027-q1";
    }).toThrow();
    expect(() => {
      verified.preservation!.uri = "other.json";
    }).toThrow();
  });

  it("snapshots the request before asynchronous evidence verification", async () => {
    const requested = input();
    const verified = await verifyAdmissionInput(requested, {
      ...deps,
      verifyEvidenceRef: async () => {
        requested.scope.period = "2027-q1";
        return { valid: true, keyClass: "operational", scope: { ...scope } };
      },
    });
    expect(verified.scope.period).toBe("2026-q4");
  });

  it.each(["predecessor", "capacity"] as const)(
    "blocks collection without verified %s evidence",
    async (field) => {
      const requested = input();
      requested[field] = null;
      expect(evaluateProgramGate(await verifyAdmissionInput(requested, deps)).status).toBe(
        "blocked",
      );
    },
  );

  it.each([
    "../escape.json",
    "/absolute.json",
    "file:///host.json",
    "dir\\escape.json",
    "a//b",
    "./receipt.json",
  ])("rejects unsafe evidence URI %s before invoking the verifier", async (uri) => {
    const requested = input();
    requested.preservation!.uri = uri;
    let called = false;
    await expect(
      verifyAdmissionInput(requested, {
        ...deps,
        verifyEvidenceRef: async () => {
          called = true;
          return { valid: true, keyClass: "operational", scope };
        },
      }),
    ).rejects.toThrow("contained relative path");
    expect(called).toBe(false);
  });

  it("rejects nested unknown fields and fractional evidence sizes", () => {
    expect(() => parseAdmissionInput({ ...input(), scope: { ...scope, allowLive: true } })).toThrow(
      "unknown field scope.allowLive",
    );
    expect(() =>
      parseAdmissionInput({ ...input(), preservation: { ...ref("p"), allowLive: true } }),
    ).toThrow("unknown field preservation.allowLive");
    expect(() =>
      parseAdmissionInput({ ...input(), preservation: { ...ref("p"), bytes: 1.5 } }),
    ).toThrow();
  });
});
