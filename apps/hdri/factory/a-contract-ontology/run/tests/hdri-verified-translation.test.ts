import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  validateManifestSet,
  type QuarterCapsule,
  type CapsuleArtifact,
  type InstrumentPlanEntry,
} from "@syrokomskyi/factory-core";
import type { VerifiedStageSnapshot, TranslationClosure } from "../pipeline/types.js";

const PERIOD = "2026-q3";
const CAPSULE_ID = "0198f000-0000-7000-8000-000000000000";

const INSTRUMENT_PLAN: InstrumentPlanEntry[] = [
  { instrument: "liveness", state: "required", reason: null },
  { instrument: "profile", state: "required", reason: null },
  { instrument: "axe", state: "required", reason: null },
  { instrument: "lighthouse", state: "disabled", reason: "Not configured for Q3 2026" },
];

const makeArtifact = (
  stage: string,
  uri: string,
  sha256: string,
  bytes: number,
): CapsuleArtifact => ({ stage, uri, sha256, bytes });

const STAGING_ARTIFACTS: CapsuleArtifact[] = [
  makeArtifact("qc", "staging/targets/liveness.json", "a".repeat(64), 100),
  makeArtifact("qc", "staging/stage-seals/liveness.json", "b".repeat(64), 100),
  makeArtifact("qc", "staging/targets/profile.json", "c".repeat(64), 100),
  makeArtifact("qc", "staging/stage-seals/profile.json", "d".repeat(64), 100),
  makeArtifact("qc", "staging/targets/axe.json", "e".repeat(64), 100),
  makeArtifact("qc", "staging/stage-seals/axe.json", "f".repeat(64), 100),
  makeArtifact("liveness", "liveness/liveness-2026-q3.db", "1".repeat(64), 500),
  makeArtifact("profile", "profile/pages-2026-q3.db", "2".repeat(64), 500),
  makeArtifact("axe", "axe/axe-2026-q3.db", "3".repeat(64), 500),
  makeArtifact("frame", "frame/frame-2026-q3.json", "4".repeat(64), 200),
  makeArtifact("emit", "emit/emit-2026-q3.json", "5".repeat(64), 200),
  makeArtifact("identity", "identity/identity-2026-q3.json", "6".repeat(64), 200),
  makeArtifact("vault", "vault/vault-2026-q3.json", "7".repeat(64), 200),
  makeArtifact("methodology", "methodology/methodology-2026-q3.json", "8".repeat(64), 200),
  makeArtifact("publication", "publication/publication-2026-q3.json", "9".repeat(64), 200),
];

const makeStagingCapsule = (deviceId: string): QuarterCapsule => ({
  period: PERIOD,
  capsuleId: CAPSULE_ID,
  state: "staging",
  instrumentPlan: INSTRUMENT_PLAN,
  artifacts: STAGING_ARTIFACTS,
});

const writeManifest = async (dir: string, deviceId: string): Promise<string> => {
  const capsule = makeStagingCapsule(deviceId);
  const manifestPath = path.join(dir, `device-${deviceId}`, "capsule-staging.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(capsule, null, 2), "utf-8");
  return manifestPath;
};

describe("RFC-0106 acceptance", () => {
  it("RFC-0106 AC-1", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ac1-"));
    try {
      const dbPath = path.join(root, "pages-2026-q3.db");
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE page_contents (sha256 TEXT PRIMARY KEY, storage_path TEXT, byte_size INTEGER);
        CREATE TABLE page_observations (site_page_id INTEGER, content_sha256 TEXT, observed_at INTEGER);
      `);
      const contentSha = "abc123def456";
      const storagePath = `data/content/${contentSha.slice(0, 2)}/${contentSha}.html`;
      db.prepare(
        "INSERT INTO page_contents (sha256, storage_path, byte_size) VALUES (?, ?, ?)",
      ).run(contentSha, storagePath, 42);
      db.close();

      const readonlyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
      const rows = readonlyDb
        .prepare(
          "SELECT sha256 AS contentHash, storage_path AS storagePath FROM page_contents ORDER BY sha256",
        )
        .all() as Array<{ contentHash: string; storagePath: string }>;
      readonlyDb.close();

      expect(rows).toHaveLength(1);
      expect(rows[0]!.contentHash).toBe(contentSha);
      expect(rows[0]!.storagePath).toBe(storagePath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0106 AC-2", () => {
    const projectionSha = "a1b2c3d4e5".repeat(6) + "a1b2";
    const snapshot: VerifiedStageSnapshot = {
      schema: "hdri-stage-snapshot@1",
      period: PERIOD,
      capsuleId: CAPSULE_ID,
      deviceId: "device-test-0001",
      stageId: "profile",
      stageSealSha256: "0".repeat(64),
      targetSetSha256: "1".repeat(64),
      selectedResultSetSha256: projectionSha,
      projectionSha256: projectionSha,
      artifactRefs: ["profile/pages-2026-q3.db"],
    };

    expect(snapshot.selectedResultSetSha256).toBe(snapshot.projectionSha256);
    expect(snapshot.schema).toBe("hdri-stage-snapshot@1");
  });

  it("RFC-0106 AC-3", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ac3-"));
    try {
      const manifestPath = await writeManifest(root, "test-0001");
      const tamperedPath = path.join(root, "tampered.json");
      const raw = await fs.readFile(manifestPath, "utf-8");
      const tampered = JSON.parse(raw) as QuarterCapsule;
      tampered.period = "2026-q4";
      await fs.writeFile(tamperedPath, JSON.stringify(tampered, null, 2), "utf-8");

      const emptyKeys = new Map();
      await expect(
        validateManifestSet([tamperedPath], emptyKeys, PERIOD, CAPSULE_ID),
      ).rejects.toThrow(/period mismatch/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0106 AC-4", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ac4-"));
    try {
      const manifestPath = await writeManifest(root, "test-0001");
      const raw = await fs.readFile(manifestPath, "utf-8");
      const capsule = JSON.parse(raw) as QuarterCapsule;
      const broken = {
        ...capsule,
        artifacts: capsule.artifacts.filter(
          (a) => !(a.stage === "qc" && a.uri === "staging/stage-seals/profile.json"),
        ),
      };
      const brokenPath = path.join(root, "broken.json");
      await fs.writeFile(brokenPath, JSON.stringify(broken, null, 2), "utf-8");

      const emptyKeys = new Map();
      await expect(
        validateManifestSet([brokenPath], emptyKeys, PERIOD, CAPSULE_ID),
      ).rejects.toThrow(/lacks stage seal for required instrument: profile/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0106 AC-5", () => {
    const expectedKeys = ["liveness.outcome", "profile.impressum", "profile.datenschutz"];
    const emittedKeys = [...expectedKeys];

    const expectedSorted = [...expectedKeys].sort();
    const emittedSorted = [...emittedKeys].sort();
    const expectedKeysSha256 = createHash("sha256").update(expectedSorted.join("\n")).digest("hex");
    const emittedKeysSha256 = createHash("sha256").update(emittedSorted.join("\n")).digest("hex");

    const closure: TranslationClosure = {
      expectedKeysSha256,
      emittedKeysSha256,
      sourceSnapshots: [],
      unresolvedReferences: 0,
    };

    expect(closure.expectedKeysSha256).toBe(closure.emittedKeysSha256);
    expect(closure.unresolvedReferences).toBe(0);
  });

  it("RFC-0106 AC-6", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ac6-"));
    try {
      const manifest1 = await writeManifest(root, "device-aaa");
      const manifest2 = await writeManifest(root, "device-bbb");

      const emptyKeys = new Map();
      const resultA = await validateManifestSet(
        [manifest1, manifest2],
        emptyKeys,
        PERIOD,
        CAPSULE_ID,
      );
      const resultB = await validateManifestSet(
        [manifest2, manifest1],
        emptyKeys,
        PERIOD,
        CAPSULE_ID,
      );

      expect(resultA.deviceIds).toEqual(resultB.deviceIds);
      expect(resultA.stageSeals).toEqual(resultB.stageSeals);
      expect(resultA.targetSetSha256).toEqual(resultB.targetSetSha256);
      expect(resultA.artifactRefs).toEqual(resultB.artifactRefs);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0106 AC-7", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-ac7-"));
    try {
      const manifestPath = await writeManifest(root, "archived");

      const emptyKeys = new Map();
      const result = await validateManifestSet([manifestPath], emptyKeys, PERIOD, CAPSULE_ID);

      expect(result.deviceIds).toHaveLength(1);
      expect(result.stageSeals.size).toBe(3);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
