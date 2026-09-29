// Must be first: loads apps/hdri/.env before gogol modules run getDeviceId()
// at module scope (RFC-0268 probes run vitest from the repo root).
import "./test-env.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  createQuarterCapsuleStaging,
  DEFAULT_INSTRUMENT_PLAN,
  QuarterExecutionJournal,
  snapshotCapsuleDbArtifact,
  type QuarterCapsule,
  type WorkKey,
} from "@syrokomskyi/factory-core";
import { shouldSealAxeStage } from "../gogols/AxeAuditGogol.js";

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
  stageId: "axe",
  provisionalAssetId: "da-a",
  instrumentVersion: "axe-v2",
};

const readManifest = async (capsuleDir: string): Promise<QuarterCapsule> =>
  JSON.parse(await fs.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"));

const sealFileExists = async (capsuleDir: string): Promise<boolean> => {
  try {
    await fs.stat(path.join(capsuleDir, "staging", "stage-seals", "axe.json"));
    return true;
  } catch {
    return false;
  }
};

/**
 * Mirrors AxeAuditGogol.run(): work finishes, then the stage seals only when
 * shouldSealAxeStage(brief) — the same predicate the gogol gates on.
 */
const runSealedStage = async (capsuleDir: string, auditSampleSize: number): Promise<void> => {
  const journal = new QuarterExecutionJournal(
    path.join(capsuleDir, "staging", "execution", "events"),
    config,
    signingKey,
  );
  await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
  await journal.declareStageTargets({
    stageId: "axe",
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

  if (shouldSealAxeStage({ auditSampleSize })) {
    const dbPath = path.join(capsuleDir, "axe-2026-q3.db");
    const db = new Database(dbPath);
    try {
      db.exec("CREATE TABLE probe(id INTEGER PRIMARY KEY); INSERT INTO probe VALUES (1);");
    } finally {
      db.close();
    }
    const output = await snapshotCapsuleDbArtifact(capsuleDir, "axe", deviceId, dbPath);
    await journal.sealStage({
      stageId: "axe",
      keys: [key],
      eventId: "seal-a",
      now: "2026-07-01T00:00:03.000Z",
      outputArtifacts: [output],
    });
  }
};

describe("RFC-0128 axe seal gate", () => {
  it("RFC-0128 AC-3: capped run produces no seal and no manifest entries; uncapped seals", async () => {
    // Capped run (auditSampleSize >= 0): the stage must not seal.
    const capped = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-axe-capped-"));
    roots.push(capped);
    await createQuarterCapsuleStaging(
      capped,
      { period, capsuleId, deviceId },
      DEFAULT_INSTRUMENT_PLAN,
    );
    await runSealedStage(capped, 25);
    expect(await sealFileExists(capped)).toBe(false);
    expect((await readManifest(capped)).artifacts).toHaveLength(0);

    // Uncapped run (auditSampleSize < 0): seal + target + output artifact.
    const uncapped = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-axe-uncapped-"));
    roots.push(uncapped);
    await createQuarterCapsuleStaging(
      uncapped,
      { period, capsuleId, deviceId },
      DEFAULT_INSTRUMENT_PLAN,
    );
    await runSealedStage(uncapped, -1);
    expect(await sealFileExists(uncapped)).toBe(true);
    expect((await readManifest(uncapped)).artifacts.map((a) => a.uri).sort()).toEqual([
      `artifacts/axe/${deviceId}/axe-2026-q3.db`,
      "staging/stage-seals/axe.json",
      "staging/targets/axe.json",
    ]);
  });
});
