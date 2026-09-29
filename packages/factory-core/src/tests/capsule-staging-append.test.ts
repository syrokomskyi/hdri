import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  appendCapsuleArtifacts,
  appendCapsuleSealArtifacts,
  createQuarterCapsuleStaging,
  snapshotCapsuleDbArtifact,
  validateManifestSet,
  type CapsuleArtifact,
  type InstrumentPlanEntry,
  type QuarterCapsule,
} from "../lib/capsule.js";
import { QuarterExecutionJournal, quarterCapsuleDir } from "../lib/execution-store.js";
import { DEFAULT_INSTRUMENT_PLAN, type WorkKey } from "../lib/quarter-contracts.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))),
);

const period = "2026-q3";
const capsuleId = "019c0000-0000-7000-8000-000000000001";
const deviceId = "device-a";
const config = "a".repeat(64);
const generated = generateSigningKey();
const signingKey = { ...generated, signingKeyId: "device-a-test", collectorId: "device-a" };
const key: WorkKey = {
  period,
  capsuleId,
  stageId: "liveness",
  provisionalAssetId: "da-a",
  instrumentVersion: "liveness-v2",
};

const ALL_DISABLED_PLAN: readonly InstrumentPlanEntry[] = DEFAULT_INSTRUMENT_PLAN.map((entry) => ({
  ...entry,
  state: "disabled" as const,
  reason: "test fixture",
}));

const readManifest = async (capsuleDir: string): Promise<QuarterCapsule> =>
  JSON.parse(await fs.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"));

const writeFile = async (capsuleDir: string, uri: string, content: string): Promise<string> => {
  const target = path.join(capsuleDir, uri);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return target;
};

const fileEntry = async (
  capsuleDir: string,
  stage: CapsuleArtifact["stage"],
  uri: string,
): Promise<CapsuleArtifact> => {
  const target = path.join(capsuleDir, uri);
  const stat = await fs.stat(target);
  const { createHash } = await import("node:crypto");
  const sha256 = createHash("sha256")
    .update(await fs.readFile(target))
    .digest("hex");
  return { stage, uri, sha256, bytes: stat.size };
};

const createSqliteDb = (dbPath: string): void => {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE probe(id INTEGER PRIMARY KEY); INSERT INTO probe VALUES (1);");
  } finally {
    db.close();
  }
};

describe("RFC-0128 capsule staging append", () => {
  it("RFC-0128 AC-1: seal appends seal artifact, target-set artifact and declared output artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-append-"));
    roots.push(root);
    await createQuarterCapsuleStaging(
      root,
      { period, capsuleId, deviceId },
      DEFAULT_INSTRUMENT_PLAN,
    );

    const dbPath = path.join(root, "liveness-2026-q3.db");
    createSqliteDb(dbPath);

    const eventsDir = path.join(root, "staging", "execution", "events");
    const journal = new QuarterExecutionJournal(eventsDir, config, signingKey);
    await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
    await journal.declareStageTargets({
      stageId: "liveness",
      keys: [key],
      eventId: "targets-a",
      now: "2026-07-01T00:00:00.500Z",
    });
    const attempt = await journal.begin({
      key,
      attemptId: "attempt-a",
      leaseOwner: deviceId,
      now: "2026-07-01T00:00:01.000Z",
      leaseExpiresAt: "2026-07-01T00:10:01.000Z",
    });
    await journal.finish(attempt!, {
      eventId: "finished-a",
      now: "2026-07-01T00:00:02.000Z",
      state: "succeeded",
      resultSha256: "c".repeat(64),
    });

    const output = await snapshotCapsuleDbArtifact(root, "liveness", deviceId, dbPath);
    expect(output.uri).toBe(`artifacts/liveness/${deviceId}/liveness-2026-q3.db`);

    await journal.sealStage({
      stageId: "liveness",
      keys: [key],
      eventId: "seal-a",
      now: "2026-07-01T00:00:03.000Z",
      outputArtifacts: [output],
    });

    const manifest = await readManifest(root);
    expect(manifest.artifacts.map((a) => a.uri).sort()).toEqual([
      `artifacts/liveness/${deviceId}/liveness-2026-q3.db`,
      "staging/stage-seals/liveness.json",
      "staging/targets/liveness.json",
    ]);
  });

  it("RFC-0128 AC-2: validateManifestSet reads deviceId from the manifest field", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-deviceid-"));
    roots.push(root);
    await createQuarterCapsuleStaging(root, { period, capsuleId, deviceId }, ALL_DISABLED_PLAN);

    const verified = await validateManifestSet(
      [path.join(root, "capsule-staging.json")],
      new Map(),
      period,
      capsuleId,
    );
    expect(verified.deviceIds).toEqual([deviceId]);

    // A manifest without deviceId is rejected — no path-shape fallback.
    const manifest = await readManifest(root);
    const { deviceId: _omit, ...noDevice } = manifest;
    await fs.writeFile(
      path.join(root, "capsule-staging.json"),
      `${JSON.stringify(noDevice, null, 2)}\n`,
      "utf8",
    );
    await expect(
      validateManifestSet([path.join(root, "capsule-staging.json")], new Map(), period, capsuleId),
    ).rejects.toThrow(/deviceId/);
  });

  it("RFC-0128 AC-5: capsule root resolves to apps/hdri/capsules/<deviceId>/<period>/<capsuleId>", () => {
    const factoryRoot = path.join(path.sep, "repo", "apps", "hdri", "factory");
    expect(quarterCapsuleDir(factoryRoot, deviceId, period, capsuleId)).toBe(
      path.join(path.sep, "repo", "apps", "hdri", "capsules", deviceId, period, capsuleId),
    );
  });

  it("RFC-0128 AC-6: validateManifestSet rejects a manifest entry whose file bytes changed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-tamper-"));
    roots.push(root);
    await createQuarterCapsuleStaging(root, { period, capsuleId, deviceId }, ALL_DISABLED_PLAN);

    const uri = `artifacts/liveness/${deviceId}/liveness-2026-q3.db`;
    const target = await writeFile(root, uri, "original bytes");
    await appendCapsuleArtifacts(root, [await fileEntry(root, "liveness", uri)]);

    const manifestPath = path.join(root, "capsule-staging.json");
    await expect(
      validateManifestSet([manifestPath], new Map(), period, capsuleId),
    ).resolves.toMatchObject({ deviceIds: [deviceId] });

    await fs.writeFile(target, "tampered bytes", "utf8");
    await expect(validateManifestSet([manifestPath], new Map(), period, capsuleId)).rejects.toThrow(
      /closure verification/,
    );
  });

  it("appendCapsuleArtifacts dedups identical entries and fails on conflicts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-dedup-"));
    roots.push(root);
    await createQuarterCapsuleStaging(root, { period, capsuleId, deviceId }, ALL_DISABLED_PLAN);

    const uri = `artifacts/axe/${deviceId}/axe-2026-q3.db`;
    await writeFile(root, uri, "axe bytes");
    const entry = await fileEntry(root, "axe", uri);

    await appendCapsuleArtifacts(root, [entry]);
    await appendCapsuleArtifacts(root, [entry]);
    expect((await readManifest(root)).artifacts).toHaveLength(1);

    await expect(
      appendCapsuleArtifacts(root, [{ ...entry, sha256: "0".repeat(64) }]),
    ).rejects.toThrow(/conflict/);
    expect((await readManifest(root)).artifacts).toHaveLength(1);
  });

  it("appendCapsuleArtifacts fails fast when the staging manifest is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-nomanifest-"));
    roots.push(root);
    await expect(
      appendCapsuleArtifacts(root, [
        { stage: "qc", uri: "staging/targets/x.json", sha256: "a".repeat(64), bytes: 1 },
      ]),
    ).rejects.toThrow(/capsule-staging\.json not found/);
  });

  it("appendCapsuleSealArtifacts rejects artifacts outside the stage scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-scope-"));
    roots.push(root);
    await createQuarterCapsuleStaging(root, { period, capsuleId, deviceId }, ALL_DISABLED_PLAN);

    // A liveness seal may only carry liveness outputs + its own qc evidence.
    await expect(
      appendCapsuleSealArtifacts(root, "liveness", [
        { stage: "axe", uri: "artifacts/axe/device-a/axe.db", sha256: "a".repeat(64), bytes: 1 },
      ]),
    ).rejects.toThrow(/outside its scope/);
    // Another stage's seal file is out of scope too.
    await expect(
      appendCapsuleSealArtifacts(root, "liveness", [
        {
          stage: "qc",
          uri: "staging/stage-seals/axe.json",
          sha256: "a".repeat(64),
          bytes: 1,
        },
      ]),
    ).rejects.toThrow(/outside its scope/);
    // Capture stages retain into the profile namespace.
    await expect(
      appendCapsuleSealArtifacts(root, "homepage-capture", [
        {
          stage: "profile",
          uri: "artifacts/profile/device-a/pages-2026-q3.db",
          sha256: "a".repeat(64),
          bytes: 1,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it("snapshotCapsuleDbArtifact reuses an existing snapshot instead of re-backing-up", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-capsule-snap-"));
    roots.push(root);
    const dbPath = path.join(root, "axe-2026-q3.db");
    createSqliteDb(dbPath);

    const first = await snapshotCapsuleDbArtifact(root, "axe", deviceId, dbPath);
    const snapshotPath = path.join(root, first.uri);
    const firstBytes = await fs.readFile(snapshotPath);

    // Source changes after the first snapshot — the sealed bytes are kept.
    const db = new Database(dbPath);
    try {
      db.exec("INSERT INTO probe VALUES (2);");
    } finally {
      db.close();
    }
    const second = await snapshotCapsuleDbArtifact(root, "axe", deviceId, dbPath);
    expect(second).toEqual(first);
    expect(await fs.readFile(snapshotPath)).toEqual(firstBytes);
  });
});
