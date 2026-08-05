import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  sealQuarterCapsule,
  validateCapsule,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  writeQuarterCapsuleCandidate,
  writeQuarterCapsuleStaging,
  type CapsuleSignature,
} from "../lib/capsule.js";

describe("quarter capsule", () => {
  const base = {
    period: "2026-q3",
    capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc",
    state: "staging" as const,
    instrumentPlan: [
      { instrument: "liveness" as const, state: "required" as const, reason: null },
      { instrument: "profile" as const, state: "required" as const, reason: null },
      { instrument: "axe" as const, state: "required" as const, reason: null },
      { instrument: "lighthouse" as const, state: "disabled" as const, reason: "Q3 plan" },
    ],
    artifacts: [
      { stage: "liveness" as const, uri: "liveness/result.db", sha256: "abc", bytes: 1 },
      { stage: "profile" as const, uri: "profile/result.db", sha256: "def", bytes: 1 },
      { stage: "axe" as const, uri: "axe/result.db", sha256: "ghi", bytes: 1 },
    ],
  };
  it("requires an explicit disabled Lighthouse and safe artifact closure", () =>
    expect(() => validateCapsule(base)).not.toThrow());
  it("rejects an escaping artifact", () =>
    expect(() =>
      validateCapsule({ ...base, artifacts: [{ ...base.artifacts[0], uri: "../q2.db" }] }),
    ).toThrow());
  it("rejects a sealed capsule without frozen targets and signed stage seals", () =>
    expect(() =>
      validateCapsule({
        ...base,
        state: "sealed" as const,
        artifacts: [
          ...base.artifacts,
          ...(["frame", "emit", "identity", "vault", "methodology", "publication"] as const).map(
            (stage) => ({ stage, uri: `${stage}/result`, sha256: "abc", bytes: 1 }),
          ),
        ],
      }),
    ).toThrow(/execution evidence/));
  it("writes an idempotent staging closure without claiming a final seal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-capsule-staging-"));
    try {
      const staging = { ...base, state: "staging" as const };
      const first = await writeQuarterCapsuleStaging(dir, staging);
      await expect(writeQuarterCapsuleStaging(dir, staging)).resolves.toBe(first);
      expect(JSON.parse(fs.readFileSync(first, "utf8")).state).toBe("staging");
      expect(fs.existsSync(path.join(dir, "capsule-manifest.json"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("writes a release candidate without granting the final seal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-capsule-candidate-"));
    try {
      const artifacts = [
        ...base.artifacts,
        ...(["frame", "emit", "identity", "vault", "methodology", "publication"] as const).map(
          (stage) => ({ stage, uri: `${stage}/result`, sha256: "", bytes: 1 }),
        ),
        ...(["liveness", "profile", "axe"] as const).flatMap((stage) => [
          { stage: "qc" as const, uri: `staging/targets/${stage}.json`, sha256: "", bytes: 1 },
          { stage: "qc" as const, uri: `staging/stage-seals/${stage}.json`, sha256: "", bytes: 1 },
        ]),
      ];
      for (const artifact of artifacts) {
        const file = path.join(dir, artifact.uri);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "x");
        artifact.sha256 = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";
      }
      await writeQuarterCapsuleCandidate(dir, { ...base, state: "candidate", artifacts });
      expect(fs.existsSync(path.join(dir, "capsule-candidate.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "capsule-manifest.json"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("seals a complete capsule with a detached verifiable signature", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-capsule-seal-"));
    try {
      const artifacts = [
        ...base.artifacts,
        ...(["frame", "emit", "identity", "vault", "methodology", "publication"] as const).map(
          (stage) => ({ stage, uri: `${stage}/result`, sha256: "", bytes: 1 }),
        ),
        ...(["liveness", "profile", "axe"] as const).flatMap((stage) => [
          { stage: "qc" as const, uri: `staging/targets/${stage}.json`, sha256: "", bytes: 1 },
          { stage: "qc" as const, uri: `staging/stage-seals/${stage}.json`, sha256: "", bytes: 1 },
        ]),
      ];
      for (const artifact of artifacts) {
        const file = path.join(dir, artifact.uri);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "x");
        artifact.sha256 = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";
      }
      const capsule = { ...base, state: "sealed" as const, artifacts };
      const generated = generateSigningKey();
      const key = { ...generated, signingKeyId: "device-a-test", collectorId: "device-a" };
      await sealQuarterCapsule(dir, capsule, key);
      const signatureBeforeRetry = fs.readFileSync(
        path.join(dir, "capsule-signature.json"),
        "utf8",
      );
      await sealQuarterCapsule(dir, capsule, key);
      expect(fs.readFileSync(path.join(dir, "capsule-signature.json"), "utf8")).toBe(
        signatureBeforeRetry,
      );
      expect(fs.readFileSync(path.join(dir, "frame/result"), "utf8")).toBe("x");
      const signature = JSON.parse(
        fs.readFileSync(path.join(dir, "capsule-signature.json"), "utf8"),
      ) as CapsuleSignature;
      expect(verifyQuarterCapsuleSignature(capsule, signature, key)).toBe(true);
      expect(verifyQuarterCapsuleSignature({ ...capsule, period: "2026-q4" }, signature, key)).toBe(
        false,
      );
      fs.writeFileSync(path.join(dir, "frame/result"), "y");
      await expect(verifyQuarterCapsuleArtifacts(dir, capsule)).rejects.toThrow(
        /closure verification/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("accepts a legacy sealed capsule without stage closure artifacts", () =>
    expect(() =>
      validateCapsule({ ...base, state: "sealed" as const, legacy: true }),
    ).not.toThrow());
  it("accepts a legacy sealed capsule without execution evidence QC artifacts", () =>
    expect(() =>
      validateCapsule({
        ...base,
        state: "sealed" as const,
        legacy: true,
        artifacts: [
          ...base.artifacts,
          ...(["frame", "emit", "identity", "vault", "methodology", "publication"] as const).map(
            (stage) => ({ stage, uri: `${stage}/result`, sha256: "abc", bytes: 1 }),
          ),
        ],
      }),
    ).not.toThrow());
  it("rejects a legacy capsule with invalid period", () =>
    expect(() =>
      validateCapsule({ ...base, state: "sealed" as const, legacy: true, period: "invalid" }),
    ).toThrow(/Invalid HDRI period/));
  it("rejects a legacy capsule with invalid capsuleId", () =>
    expect(() =>
      validateCapsule({
        ...base,
        state: "sealed" as const,
        legacy: true,
        capsuleId: "not-a-uuid",
      }),
    ).toThrow(/UUID v7/));
  it("rejects a legacy capsule with escaping artifact URI", () =>
    expect(() =>
      validateCapsule({
        ...base,
        state: "sealed" as const,
        legacy: true,
        artifacts: [{ ...base.artifacts[0], uri: "../escape.db" }],
      }),
    ).toThrow());
  it("requires liveness artifact for legacy non-staging state", () =>
    expect(() =>
      validateCapsule({
        ...base,
        state: "sealed" as const,
        legacy: true,
        artifacts: [
          { stage: "profile" as const, uri: "profile/result.db", sha256: "def", bytes: 1 },
          { stage: "axe" as const, uri: "axe/result.db", sha256: "ghi", bytes: 1 },
        ],
      }),
    ).toThrow(/liveness/));
  it("seals a legacy capsule with minimal artifacts and legacy: true", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-capsule-legacy-"));
    try {
      const legacyArtifacts = [...base.artifacts];
      for (const artifact of legacyArtifacts) {
        const file = path.join(dir, artifact.uri);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "x");
        artifact.sha256 = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";
      }
      const capsule = {
        ...base,
        state: "sealed" as const,
        artifacts: legacyArtifacts,
        legacy: true,
      };
      const generated = generateSigningKey();
      const key = { ...generated, signingKeyId: "device-a-legacy", collectorId: "device-a" };
      await sealQuarterCapsule(dir, capsule, key);
      expect(fs.existsSync(path.join(dir, "capsule-manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "capsule-signature.json"))).toBe(true);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, "capsule-manifest.json"), "utf8"),
      ) as { legacy?: boolean };
      expect(manifest.legacy).toBe(true);
      const signature = JSON.parse(
        fs.readFileSync(path.join(dir, "capsule-signature.json"), "utf8"),
      ) as CapsuleSignature;
      expect(verifyQuarterCapsuleSignature(capsule, signature, key)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
