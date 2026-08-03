import { createHash } from "node:crypto";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { canonicalize, generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  parsePriorCapsulesFile,
  verifyQuarterCapsuleSignature,
  type CapsuleArtifact,
  type CapsuleSignature,
  type InstrumentPlanEntry,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";

const buildKeyEnv = (keysDir: string): Record<string, string> => {
  const key = generateSigningKey();
  const deviceId = "test-device";
  const fingerprint = createHash("sha256").update(key.publicKeyPem).digest("hex").slice(0, 16);
  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(path.join(keysDir, `${deviceId}.pem`), key.publicKeyPem);
  return {
    DEVICE_ID: deviceId,
    DEVICE_SIGNING_KEY: Buffer.from(key.privateKeyPem, "utf-8").toString("base64"),
    __TEST_SIGNING_KEY_ID: `${deviceId}-${fingerprint}`,
    __TEST_PUBLIC_KEY_PEM: key.publicKeyPem,
    __TEST_PRIVATE_KEY_PEM: key.privateKeyPem,
  };
};

const createFrameJson = (
  dir: string,
  period: string,
): { uri: string; sha256: string; bytes: number } => {
  const frameDir = path.join(dir, "source-ledger");
  fs.mkdirSync(frameDir, { recursive: true });
  const framePath = path.join(frameDir, `frame-${period}.json`);
  const frame = {
    period,
    candidateIds: [],
    includedBatchIds: [],
    ledgerHead: "abc123def456",
    occurrenceProjectionSha256: "a".repeat(64),
    frameSha256: "b".repeat(64),
  };
  fs.writeFileSync(framePath, JSON.stringify(frame, null, 2));
  const content = fs.readFileSync(framePath);
  return {
    uri: `source-ledger/frame-${period}.json`,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createSegmentJson = (
  dir: string,
  batchId: string,
): { uri: string; sha256: string; bytes: number } => {
  const segDir = path.join(dir, "source-ledger", "segments");
  fs.mkdirSync(segDir, { recursive: true });
  const segPath = path.join(segDir, `${batchId}.json`);
  const seg = { batchId, occurrences: [] };
  fs.writeFileSync(segPath, JSON.stringify(seg, null, 2));
  const content = fs.readFileSync(segPath);
  return {
    uri: `source-ledger/segments/${batchId}.json`,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createLivenessArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "liveness.db");
  fs.writeFileSync(artifactPath, "fake liveness db");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "liveness.db",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createEmitArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const emitDir = path.join(dir, "emit");
  fs.mkdirSync(emitDir, { recursive: true });
  const manifestPath = path.join(emitDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1 }));
  const content = fs.readFileSync(manifestPath);
  return {
    uri: "emit/manifest.json",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createIdentityArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "identity.parquet");
  fs.writeFileSync(artifactPath, "fake identity parquet");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "identity.parquet",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createVaultArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "vault.parquet");
  fs.writeFileSync(artifactPath, "fake vault parquet");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "vault.parquet",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createMethodologyArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "methodology.yaml");
  fs.writeFileSync(artifactPath, "fake methodology");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "methodology.yaml",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createPublicationArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "publication.json");
  fs.writeFileSync(artifactPath, "fake publication");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "publication.json",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createQcArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "qc-report.json");
  fs.writeFileSync(artifactPath, "fake qc");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "qc-report.json",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const createAxeArtifact = (dir: string): { uri: string; sha256: string; bytes: number } => {
  const artifactPath = path.join(dir, "axe.db");
  fs.writeFileSync(artifactPath, "fake axe db");
  const content = fs.readFileSync(artifactPath);
  return {
    uri: "axe.db",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
  };
};

const buildSealedCapsule = (
  capsuleDir: string,
  keyEnv: Record<string, string>,
  options?: {
    period?: string;
    capsuleId?: string;
    noFrame?: boolean;
    noSegments?: boolean;
  },
): { capsule: QuarterCapsule; signature: CapsuleSignature } => {
  const period = options?.period ?? "2026-q2";
  const capsuleId = options?.capsuleId ?? "0198f000-0000-7000-8000-000000000000";

  fs.mkdirSync(capsuleDir, { recursive: true });

  const artifacts: CapsuleArtifact[] = [];
  const liveness = createLivenessArtifact(capsuleDir);
  artifacts.push({ stage: "liveness", ...liveness });
  const emit = createEmitArtifact(capsuleDir);
  artifacts.push({ stage: "emit", ...emit });
  const identity = createIdentityArtifact(capsuleDir);
  artifacts.push({ stage: "identity", ...identity });
  const vault = createVaultArtifact(capsuleDir);
  artifacts.push({ stage: "vault", ...vault });
  const methodology = createMethodologyArtifact(capsuleDir);
  artifacts.push({ stage: "methodology", ...methodology });
  const publication = createPublicationArtifact(capsuleDir);
  artifacts.push({ stage: "publication", ...publication });
  const qc = createQcArtifact(capsuleDir);
  artifacts.push({ stage: "qc", ...qc });
  const axe = createAxeArtifact(capsuleDir);
  artifacts.push({ stage: "axe", ...axe });

  if (!options?.noFrame) {
    const frame = createFrameJson(capsuleDir, period);
    artifacts.push({ stage: "frame", ...frame });
  }

  if (!options?.noSegments) {
    const seg1 = createSegmentJson(capsuleDir, "2026-q2-de-01");
    artifacts.push({ stage: "frame", ...seg1 });
    const seg2 = createSegmentJson(capsuleDir, "2026-q2-de-05");
    artifacts.push({ stage: "frame", ...seg2 });
  }

  const instrumentPlan: InstrumentPlanEntry[] = [
    { instrument: "liveness", state: "required" as const, reason: null },
    { instrument: "profile", state: "required" as const, reason: null },
    { instrument: "axe", state: "required" as const, reason: null },
    { instrument: "lighthouse", state: "disabled" as const, reason: "Not configured" },
  ];

  const capsule: QuarterCapsule = {
    period,
    capsuleId,
    state: "sealed",
    instrumentPlan,
    artifacts,
    legacy: true,
  };

  const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(capsule, null, 2)}\n`);

  const payload = createHash("sha256").update(canonicalize(capsule), "utf8").digest();
  const signature: CapsuleSignature = {
    schemaVersion: 1,
    algorithm: "ed25519",
    manifestSha256: payload.toString("hex"),
    signature: crypto
      .sign(null, payload, crypto.createPrivateKey(keyEnv.__TEST_PRIVATE_KEY_PEM))
      .toString("base64url"),
    signedAt: new Date().toISOString(),
    signingKeyId: keyEnv.__TEST_SIGNING_KEY_ID,
    collectorId: "test-device",
  };
  fs.writeFileSync(
    path.join(capsuleDir, "capsule-signature.json"),
    `${JSON.stringify(signature, null, 2)}\n`,
  );

  return { capsule, signature };
};

const runQuarterInit = (
  args: string[],
  keyEnv?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } => {
  try {
    const stdout = execFileSync(
      "pnpm",
      [
        "--filter",
        "@syrokomskyi/observatory",
        "exec",
        "tsx",
        "-C",
        "@syrokomskyi/source",
        "tools/quarter-init.ts",
        ...args,
      ],
      {
        encoding: "utf8",
        timeout: 30000,
        env: { ...process.env, ...(keyEnv ?? {}) },
      },
    );
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    return {
      stdout: (error as { stdout?: string }).stdout ?? "",
      stderr: (error as { stderr?: string }).stderr ?? String(error),
      exitCode: (error as { status?: number }).status ?? 1,
    };
  }
};

describe("quarter:init", () => {
  it("generates valid prior-capsules.json from a sealed capsule", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv);

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
          "--json",
        ],
        keyEnv,
      );

      expect(result.exitCode).toBe(0);
      const jsonLine = result.stdout.split("\n").find((l) => l.startsWith('{"'));
      const parsed = JSON.parse(jsonLine ?? result.stdout);
      expect(parsed.command).toBe("hdri.quarter.init");
      expect(parsed.status).toBe("ok");
      expect(parsed.currentPeriod).toBe("2026-q3");
      expect(parsed.priorCapsule.period).toBe("2026-q2");
      expect(parsed.priorCapsule.capsuleId).toBe("0198f000-0000-7000-8000-000000000000");
      expect(parsed.priorCapsule.batchIds).toEqual(["2026-q2-de-01", "2026-q2-de-05"]);
      expect(parsed.totalEntries).toBe(1);
      expect(parsed.outputPath).toBe(outputPath);

      const fileContent = fs.readFileSync(outputPath, "utf8");
      const validated = parsePriorCapsulesFile(fileContent);
      expect(validated.schemaVersion).toBe("1");
      expect(validated.currentPeriod).toBe("2026-q3");
      expect(validated.priorCapsules).toHaveLength(1);
      expect(validated.priorCapsules[0].period).toBe("2026-q2");
      expect(validated.priorCapsules[0].batchIds).toEqual(["2026-q2-de-01", "2026-q2-de-05"]);
      expect(validated.priorCapsules[0].sourceLedgerHead).toBe("abc123def456");
      expect(validated.priorCapsules[0].frameId).toBe("frame-2026-q2.json");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("generated prior-capsules.json passes parsePriorCapsulesFile validation", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-validate-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv);

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      const fileContent = fs.readFileSync(outputPath, "utf8");
      expect(() => parsePriorCapsulesFile(fileContent)).not.toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifies capsule signature before writing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-sig-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      const { capsule, signature } = buildSealedCapsule(capsuleDir, keyEnv);

      expect(
        verifyQuarterCapsuleSignature(capsule, signature, {
          publicKeyPem: keyEnv.__TEST_PUBLIC_KEY_PEM,
          signingKeyId: keyEnv.__TEST_SIGNING_KEY_ID,
        }),
      ).toBe(true);

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      expect(result.exitCode).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite existing prior-capsules.json without --force (merges instead)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-merge-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv);

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const existing = {
        schemaVersion: "1",
        currentPeriod: "2026-q3",
        priorCapsules: [
          {
            period: "2026-q1",
            capsuleId: "0198f000-0000-7000-8000-000000000001",
            manifestPath: "some/path.json",
            sourceLedgerHead: "old-head",
            frameId: "frame-2026-q1.json",
            batchIds: ["2026-q1-de-01"],
          },
        ],
      };
      fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

      runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      const fileContent = fs.readFileSync(outputPath, "utf8");
      const validated = parsePriorCapsulesFile(fileContent);
      expect(validated.priorCapsules).toHaveLength(2);
      const periods = validated.priorCapsules.map((e) => e.period);
      expect(periods).toContain("2026-q1");
      expect(periods).toContain("2026-q2");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("with --force replaces existing prior-capsules.json entirely", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-force-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv);

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const existing = {
        schemaVersion: "1",
        currentPeriod: "2026-q3",
        priorCapsules: [
          {
            period: "2026-q1",
            capsuleId: "0198f000-0000-7000-8000-000000000001",
            manifestPath: "some/path.json",
            sourceLedgerHead: "old-head",
            frameId: "frame-2026-q1.json",
            batchIds: ["2026-q1-de-01"],
          },
        ],
      };
      fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

      runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
          "--force",
        ],
        keyEnv,
      );

      const fileContent = fs.readFileSync(outputPath, "utf8");
      const validated = parsePriorCapsulesFile(fileContent);
      expect(validated.priorCapsules).toHaveLength(1);
      expect(validated.priorCapsules[0].period).toBe("2026-q2");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on unsealed capsule", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-unsealed-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      const { capsule } = buildSealedCapsule(capsuleDir, keyEnv);

      const unsealed = { ...capsule, state: "candidate" as const };
      fs.writeFileSync(
        path.join(capsuleDir, "capsule-manifest.json"),
        `${JSON.stringify(unsealed, null, 2)}\n`,
      );

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain("not sealed");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on invalid signature", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-bad-sig-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv);

      const badSig = {
        schemaVersion: 1,
        algorithm: "ed25519",
        manifestSha256: "0".repeat(64),
        signature: "invalid-base64url",
        signedAt: new Date().toISOString(),
        signingKeyId: "wrong-key-id",
        collectorId: "wrong-device",
      };
      fs.writeFileSync(
        path.join(capsuleDir, "capsule-signature.json"),
        `${JSON.stringify(badSig, null, 2)}\n`,
      );

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on missing frame artifact", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-no-frame-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv, { noFrame: true });

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain("Frame artifact not found");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles empty batchIds (zero segments) without error", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-empty-batches-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const capsuleDir = path.join(tmpDir, "capsule");
      buildSealedCapsule(capsuleDir, keyEnv, { noSegments: true });

      const outputPath = path.join(tmpDir, "prior-capsules.json");
      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          manifestPath,
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
          "--json",
        ],
        keyEnv,
      );

      expect(result.exitCode).toBe(0);
      const jsonLine = result.stdout.split("\n").find((l) => l.startsWith('{"'));
      const parsed = JSON.parse(jsonLine ?? result.stdout);
      expect(parsed.priorCapsule.batchIds).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on missing prior capsule manifest", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-quarter-init-missing-manifest-"));
    try {
      const keysDir = path.join(tmpDir, "keys");
      const keyEnv = buildKeyEnv(keysDir);

      const outputPath = path.join(tmpDir, "prior-capsules.json");

      const result = runQuarterInit(
        [
          "--prior-capsule",
          path.join(tmpDir, "nonexistent.json"),
          "--current-period",
          "2026-q3",
          "--output",
          outputPath,
          "--keys-dir",
          keysDir,
        ],
        keyEnv,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain("not found");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
