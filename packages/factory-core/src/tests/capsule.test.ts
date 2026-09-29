import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  createQuarterCapsuleStaging,
  sealQuarterCapsule,
  validateCapsule,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  writeQuarterCapsuleCandidate,
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
  const availabilityCapsule = () => ({
    ...base, state: "candidate" as const, deviceId: "device-test", releaseProfile: "availability-only@1" as const,
    artifacts: [
      ...base.artifacts,
      ...(["frame", "emit"] as const).map(stage => ({ stage, uri: `${stage}/result`, sha256: "a".repeat(64), bytes: 1 })),
      { stage: "methodology" as const, uri: "artifacts/methodology/publication-scope.yaml", sha256: "a".repeat(64), bytes: 1 },
      ...["public-manifest.json", "availability.json", "availability.csv"].map(name => ({
        stage: "publication" as const, uri: `artifacts/publication/${name}`, sha256: "a".repeat(64), bytes: 1,
      })),
      ...(["liveness", "homepage-capture", "detected-page-capture", "axe"] as const).flatMap(stage => [
        { stage: "qc" as const, uri: `staging/targets/${stage}.json`, sha256: "a".repeat(64), bytes: 1 },
        { stage: "qc" as const, uri: `staging/stage-seals/${stage}.json`, sha256: "a".repeat(64), bytes: 1 },
      ]),
    ],
  });
  it("availability profile omits only identity and vault; the default contract still requires both", () => {
    const capsule = availabilityCapsule();
    expect(() => validateCapsule(capsule)).not.toThrow();
    expect(() => validateCapsule({ ...capsule, releaseProfile: undefined })).toThrow(/identity/);
    expect(() => validateCapsule({ ...capsule, legacy: true })).toThrow(/nonlegacy/);
    expect(() => validateCapsule({ ...capsule, deviceId: undefined })).toThrow(/device-bound/);
  });
  it.each(["frame/result", "emit/result", "artifacts/methodology/publication-scope.yaml",
    "artifacts/publication/availability.csv", "staging/targets/liveness.json", "staging/stage-seals/axe.json",
    "staging/targets/homepage-capture.json", "staging/stage-seals/detected-page-capture.json"])(
    "availability profile still requires %s", uri => {
      const capsule = availabilityCapsule();
      expect(() => validateCapsule({ ...capsule, artifacts: capsule.artifacts.filter(a => a.uri !== uri) })).toThrow();
    });
  it("availability profile cannot carry score publications or unknown profile versions", () => {
    const capsule = availabilityCapsule();
    expect(() => validateCapsule({ ...capsule, artifacts: [...capsule.artifacts,
      { stage: "publication", uri: "artifacts/publication/cross-section.json", sha256: "a".repeat(64), bytes: 1 }] })).toThrow(/excluded/);
    expect(() => validateCapsule(JSON.parse(JSON.stringify({ ...capsule, releaseProfile: "availability-only@2" })))).toThrow(/Unknown/);
    expect(() => validateCapsule({ ...capsule, instrumentPlan: capsule.instrumentPlan.map(entry =>
      entry.instrument === "liveness" ? { ...entry, state: "disabled" as const, reason: "skip" } : entry) })).toThrow(/liveness instrument/);
  });
  it("signs the availability profile and detects profile or retained-byte substitution", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-availability-seal-"));
    try {
      const value = availabilityCapsule();
      const artifacts = value.artifacts.map(artifact => ({ ...artifact,
        sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" }));
      for (const artifact of artifacts) {
        const file = path.join(dir, artifact.uri);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "x");
      }
      const capsule = { ...value, state: "sealed" as const, artifacts };
      const key = { ...generateSigningKey(), signingKeyId: "device-test-key", collectorId: "device-test" };
      await sealQuarterCapsule(dir, capsule, key);
      const signature = JSON.parse(fs.readFileSync(path.join(dir, "capsule-signature.json"), "utf8"));
      expect(verifyQuarterCapsuleSignature(capsule, signature, key)).toBe(true);
      const { releaseProfile: _profile, ...withoutProfile } = capsule;
      expect(verifyQuarterCapsuleSignature(withoutProfile, signature, key)).toBe(false);
      fs.writeFileSync(path.join(dir, "artifacts/publication/availability.csv"), "y");
      await expect(verifyQuarterCapsuleArtifacts(dir, capsule)).rejects.toThrow(/closure verification/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
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
      const identity = {
        period: base.period,
        capsuleId: base.capsuleId,
        deviceId: "device-test",
      };
      const first = await createQuarterCapsuleStaging(dir, identity, base.instrumentPlan);
      await expect(createQuarterCapsuleStaging(dir, identity, base.instrumentPlan)).resolves.toBe(
        first,
      );
      const written = JSON.parse(fs.readFileSync(first, "utf8"));
      expect(written.state).toBe("staging");
      expect(written.deviceId).toBe("device-test");
      expect(written.artifacts).toEqual([]);
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
        ...(["liveness", "homepage-capture", "detected-page-capture", "axe"] as const).flatMap((stage) => [
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
        ...(["liveness", "homepage-capture", "detected-page-capture", "axe"] as const).flatMap((stage) => [
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
