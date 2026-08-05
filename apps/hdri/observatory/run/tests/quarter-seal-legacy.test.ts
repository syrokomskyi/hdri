import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  type CapsuleSignature,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const createTempDb = (dir: string, name: string): string => {
  const dbPath = path.join(dir, name);
  const db = new Database(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS t (v INTEGER)");
  db.close();
  return dbPath;
};

const createEmitBundle = (dir: string): string => {
  const emitDir = path.join(dir, "emit");
  fs.mkdirSync(emitDir, { recursive: true });
  fs.writeFileSync(path.join(emitDir, "manifest.json"), JSON.stringify({ schemaVersion: 1 }));
  fs.writeFileSync(path.join(emitDir, "partitions.ndjson"), '{"id":"test"}\n');
  return emitDir;
};

const createSourceLedger = (dir: string): string => {
  const ledgerDir = path.join(dir, "source-ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, "segment-001.ndjson"), '{"batch":"q2-001"}\n');
  return ledgerDir;
};

const buildKeyEnv = (): Record<string, string> => {
  const key = generateSigningKey();
  const deviceId = "test-device";
  const fingerprint = createHash("sha256").update(key.publicKeyPem).digest("hex").slice(0, 16);
  return {
    DEVICE_ID: deviceId,
    DEVICE_SIGNING_KEY: Buffer.from(key.privateKeyPem, "utf-8").toString("base64"),
    __TEST_SIGNING_KEY_ID: `${deviceId}-${fingerprint}`,
    __TEST_PUBLIC_KEY_PEM: key.publicKeyPem,
  };
};

const runSealLegacy = (
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
        "tools/quarter-seal-legacy.ts",
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

describe("quarter:seal-legacy", () => {
  it("seals a valid legacy capsule with legacy: true", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const axeDb = createTempDb(dbDir, "axe.db");
      const emitDir = createEmitBundle(tmpDir);
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");

      const keyEnv = buildKeyEnv();

      runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          emitDir,
          "--core-db",
          coreDb,
          "--liveness-db",
          livenessDb,
          "--pages-db",
          pagesDb,
          "--axe-db",
          axeDb,
          "--source-ledger-dir",
          sourceLedgerDir,
        ],
        keyEnv,
      );

      const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as QuarterCapsule;
      expect(manifest.legacy).toBe(true);
      expect(manifest.state).toBe("sealed");
      expect(manifest.period).toBe("2026-q2");

      const signature = JSON.parse(
        fs.readFileSync(path.join(capsuleDir, "capsule-signature.json"), "utf8"),
      ) as CapsuleSignature;
      expect(
        verifyQuarterCapsuleSignature(manifest, signature, {
          publicKeyPem: keyEnv.__TEST_PUBLIC_KEY_PEM,
          signingKeyId: keyEnv.__TEST_SIGNING_KEY_ID,
        }),
      ).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sealed legacy capsule passes verifyQuarterCapsuleArtifacts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-verify-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const emitDir = createEmitBundle(tmpDir);
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");

      const keyEnv = buildKeyEnv();

      runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          emitDir,
          "--core-db",
          coreDb,
          "--liveness-db",
          livenessDb,
          "--pages-db",
          pagesDb,
          "--source-ledger-dir",
          sourceLedgerDir,
        ],
        keyEnv,
      );

      const manifest = JSON.parse(
        fs.readFileSync(path.join(capsuleDir, "capsule-manifest.json"), "utf8"),
      ) as QuarterCapsule;
      await expect(verifyQuarterCapsuleArtifacts(capsuleDir, manifest)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when DB file is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-missing-db-"));
    try {
      const emitDir = createEmitBundle(tmpDir);
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");

      const result = runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          emitDir,
          "--core-db",
          path.join(tmpDir, "nonexistent.db"),
          "--liveness-db",
          path.join(tmpDir, "nonexistent2.db"),
          "--pages-db",
          path.join(tmpDir, "nonexistent3.db"),
          "--source-ledger-dir",
          sourceLedgerDir,
        ],
        buildKeyEnv(),
      );
      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when emit manifest is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-missing-emit-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const badEmitDir = path.join(tmpDir, "bad-emit");
      fs.mkdirSync(badEmitDir, { recursive: true });
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");

      const result = runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          badEmitDir,
          "--core-db",
          coreDb,
          "--liveness-db",
          livenessDb,
          "--pages-db",
          pagesDb,
          "--source-ledger-dir",
          sourceLedgerDir,
        ],
        buildKeyEnv(),
      );
      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when source-ledger-dir is not found", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-missing-ledger-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const emitDir = createEmitBundle(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");

      const result = runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          emitDir,
          "--core-db",
          coreDb,
          "--liveness-db",
          livenessDb,
          "--pages-db",
          pagesDb,
          "--source-ledger-dir",
          path.join(tmpDir, "nonexistent-ledger"),
        ],
        buildKeyEnv(),
      );
      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when capsule-manifest.json already exists", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-already-sealed-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const emitDir = createEmitBundle(tmpDir);
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");
      fs.mkdirSync(capsuleDir, { recursive: true });
      fs.writeFileSync(path.join(capsuleDir, "capsule-manifest.json"), "{}");

      const result = runSealLegacy([
        "--period",
        "2026-q2",
        "--capsule-id",
        "0198f000-0000-7000-8000-000000000000",
        "--capsule-dir",
        capsuleDir,
        "--emit-dir",
        emitDir,
        "--core-db",
        coreDb,
        "--liveness-db",
        livenessDb,
        "--pages-db",
        pagesDb,
        "--source-ledger-dir",
        sourceLedgerDir,
      ]);
      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when capsule-staging.json exists without --force", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-seal-legacy-staging-exists-"));
    try {
      const dbDir = path.join(tmpDir, "dbs");
      fs.mkdirSync(dbDir, { recursive: true });
      const livenessDb = createTempDb(dbDir, "liveness.db");
      const coreDb = createTempDb(dbDir, "core.db");
      const pagesDb = createTempDb(dbDir, "pages.db");
      const emitDir = createEmitBundle(tmpDir);
      const sourceLedgerDir = createSourceLedger(tmpDir);
      const capsuleDir = path.join(tmpDir, "capsule");
      fs.mkdirSync(capsuleDir, { recursive: true });
      fs.writeFileSync(path.join(capsuleDir, "capsule-staging.json"), "{}");

      const result = runSealLegacy(
        [
          "--period",
          "2026-q2",
          "--capsule-id",
          "0198f000-0000-7000-8000-000000000000",
          "--capsule-dir",
          capsuleDir,
          "--emit-dir",
          emitDir,
          "--core-db",
          coreDb,
          "--liveness-db",
          livenessDb,
          "--pages-db",
          pagesDb,
          "--source-ledger-dir",
          sourceLedgerDir,
        ],
        buildKeyEnv(),
      );
      expect(result.exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
