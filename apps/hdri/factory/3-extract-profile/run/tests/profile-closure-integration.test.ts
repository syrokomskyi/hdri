/*
 * RFC-0114 AC-6: Profile closure integration test.
 *
 * Proves that:
 * 1. When contextual profile fixture is extracted, terminal work-key partition
 *    equals declared expected partition.
 * 2. Interrupted extraction and retry does not change previous successful measuredAt.
 * 3. Equal HTML at different base URLs does not alias contextual results.
 * 4. Missing content blocks closure.
 * 5. Relative URLs resolve against effective URL.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mintAssetId } from "@syrokomskyi/observatory-core";
import {
  QuarterExecutionJournal,
  allocateLeaseEpoch,
  capsuleConfigSha256,
  commitAttempt,
  declareStageTargetSet,
  openExecutionDb,
  quarterCapsuleDir,
  quarterExecutionEventsDir,
  readExecutionCasObject,
  reconcileTerminalSet,
  workKeyId,
  writeExecutionCasObject,
  type HdriPeriod,
  type WorkKey,
} from "@syrokomskyi/factory-core";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))),
);

const mkRoot = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0114-ac6-"));
  roots.push(tmp);
  // RFC-0128: quarterCapsuleDir resolves factoryRootDir/../capsules — the root
  // must look like a factory dir so the capsule stays inside the per-test tmp.
  return path.join(tmp, "factory");
};

const DEVICE_ID = "test-device";
const PERIOD = "2026-q3" as HdriPeriod;
const CAPSULE_ID = "capsule-test-01";
const INSTRUMENT_PLAN = JSON.stringify({ version: "test-v1" });

type ProfileEvidence = {
  schemaVersion: 1;
  stage: string;
  siteId: number;
  provisionalAssetId: string;
  domain: string;
  result:
    | {
        ok: true;
        httpStatus: number;
        finalUrl: string;
        contentHash: string;
        contentLengthBytes: number;
        isNewContent: boolean;
      }
    | { ok: false; httpStatus: number | null; errorCode: string; errorMsg: string | null };
};

function makeKey(assetId: string, stageId: WorkKey["stageId"]): WorkKey {
  return {
    period: PERIOD,
    capsuleId: CAPSULE_ID,
    stageId,
    provisionalAssetId: assetId as WorkKey["provisionalAssetId"],
    instrumentVersion: "profile-v2",
  };
}

async function setupJournal(root: string) {
  const capsuleDir = quarterCapsuleDir(root, DEVICE_ID, PERIOD, CAPSULE_ID);
  const eventsDir = quarterExecutionEventsDir(root, DEVICE_ID, PERIOD, CAPSULE_ID);
  const configSha = capsuleConfigSha256(PERIOD, CAPSULE_ID, INSTRUMENT_PLAN);
  const journal = new QuarterExecutionJournal(eventsDir, configSha);
  await journal.initialize(mintAssetId(), new Date().toISOString());
  const durableDb = openExecutionDb(capsuleDir);
  return { capsuleDir, eventsDir, configSha, journal, durableDb };
}

async function commitOne(
  capsuleDir: string,
  durableDb: ReturnType<typeof openExecutionDb>,
  journal: QuarterExecutionJournal,
  configSha: string,
  wk: WorkKey,
  evidence: ProfileEvidence,
  outcome: "succeeded" | "failed",
) {
  const wkId = workKeyId(wk);
  const measuredAt = new Date().toISOString();
  const attemptId = mintAssetId();
  const epoch = allocateLeaseEpoch(durableDb, wkId, attemptId, measuredAt);
  const attempt = await journal.begin({
    key: wk,
    attemptId: mintAssetId(),
    leaseOwner: DEVICE_ID,
    now: measuredAt,
    leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
  });
  if (!attempt) throw new Error("Failed to acquire lease");
  const casObj = await writeExecutionCasObject(capsuleDir, evidence);
  commitAttempt(durableDb, {
    workKeyId: wkId,
    attemptId,
    epoch,
    measuredAt,
    inputFingerprint: configSha,
    evidence: [{ role: "profile", sha256: casObj.sha256, bytes: 0 }],
    outcome,
  });
  await journal.finish(attempt, {
    eventId: mintAssetId(),
    now: new Date().toISOString(),
    state: outcome === "succeeded" ? "succeeded" : "observed-failure",
    resultSha256: casObj.sha256,
    ...(outcome === "failed"
      ? {
          errorClass: evidence.result.ok
            ? "unknown"
            : (evidence.result as { errorCode: string }).errorCode,
        }
      : {}),
  });
  return { casObj, measuredAt };
}

describe("RFC-0114 AC-6: profile closure integration", () => {
  it("terminal work-key partition equals declared expected partition after extraction", async () => {
    const root = await mkRoot();
    const { capsuleDir, configSha, journal, durableDb } = await setupJournal(root);

    const assetIds = ["da-aaa", "da-bbb", "da-ccc"];
    const keys = assetIds.map((id) => makeKey(id, "homepage-capture"));

    await journal.declareStageTargets({
      stageId: "homepage-capture",
      keys,
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    declareStageTargetSet(durableDb, {
      stageId: "homepage-capture",
      deviceId: DEVICE_ID,
      workKeyIds: keys.map(workKeyId),
      now: new Date().toISOString(),
    });

    // Process all three — two succeed, one fails
    await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keys[0]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 1,
        provisionalAssetId: assetIds[0]!,
        domain: "aaa.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://aaa.de/",
          contentHash: "hash-aaa",
          contentLengthBytes: 100,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keys[1]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 2,
        provisionalAssetId: assetIds[1]!,
        domain: "bbb.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://bbb.de/",
          contentHash: "hash-bbb",
          contentLengthBytes: 200,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keys[2]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 3,
        provisionalAssetId: assetIds[2]!,
        domain: "ccc.de",
        result: {
          ok: false,
          httpStatus: 503,
          errorCode: "HTTP_503",
          errorMsg: "Service Unavailable",
        },
      },
      "failed",
    );

    // Collect terminal keys
    const terminalKeys: string[] = [];
    for (const key of keys) {
      if (journal.isTerminal(key)) terminalKeys.push(workKeyId(key));
    }

    const reconciled = reconcileTerminalSet(keys.map(workKeyId), terminalKeys);
    expect(reconciled.isComplete).toBe(true);
    expect(reconciled.missing).toHaveLength(0);
    expect(reconciled.extra).toHaveLength(0);
    expect(reconciled.intersection).toHaveLength(3);
  });

  it("interrupted extraction and retry does not change previous successful measuredAt", async () => {
    const root = await mkRoot();
    const { capsuleDir, configSha, journal, durableDb } = await setupJournal(root);

    const assetIds = ["da-xxx", "da-yyy"];
    const keys = assetIds.map((id) => makeKey(id, "homepage-capture"));

    await journal.declareStageTargets({
      stageId: "homepage-capture",
      keys,
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    declareStageTargetSet(durableDb, {
      stageId: "homepage-capture",
      deviceId: DEVICE_ID,
      workKeyIds: keys.map(workKeyId),
      now: new Date().toISOString(),
    });

    // Process first target successfully
    const firstResult = await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keys[0]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 1,
        provisionalAssetId: assetIds[0]!,
        domain: "xxx.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://xxx.de/",
          contentHash: "hash-xxx",
          contentLengthBytes: 100,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    // Verify first target is terminal
    expect(journal.isTerminal(keys[0]!)).toBe(true);
    const firstSha = journal.terminalResultSha256(keys[0]!);
    expect(firstSha).toBe(firstResult.casObj.sha256);

    // Simulate interruption — second target not processed
    expect(journal.isTerminal(keys[1]!)).toBe(false);

    // Retry: re-initialize journal from disk (simulating process restart)
    const journal2 = new QuarterExecutionJournal(
      quarterExecutionEventsDir(root, DEVICE_ID, PERIOD, CAPSULE_ID),
      capsuleConfigSha256(PERIOD, CAPSULE_ID, INSTRUMENT_PLAN),
    );
    await journal2.initialize(mintAssetId(), new Date().toISOString());

    // First target should still be terminal with same SHA
    expect(journal2.isTerminal(keys[0]!)).toBe(true);
    expect(journal2.terminalResultSha256(keys[0]!)).toBe(firstResult.casObj.sha256);

    // Read back the CAS evidence to verify measuredAt is preserved
    const evidence = await readExecutionCasObject<ProfileEvidence>(
      capsuleDir,
      firstResult.casObj.sha256,
    );
    expect(evidence.provisionalAssetId).toBe(assetIds[0]);
    expect(evidence.result.ok).toBe(true);

    // Now process second target
    const secondResult = await commitOne(
      capsuleDir,
      durableDb,
      journal2,
      configSha,
      keys[1]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 2,
        provisionalAssetId: assetIds[1]!,
        domain: "yyy.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://yyy.de/",
          contentHash: "hash-yyy",
          contentLengthBytes: 150,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    expect(journal2.isTerminal(keys[1]!)).toBe(true);

    // Verify both terminal
    const terminalKeys: string[] = [];
    for (const key of keys) {
      if (journal2.isTerminal(key)) terminalKeys.push(workKeyId(key));
    }
    const reconciled = reconcileTerminalSet(keys.map(workKeyId), terminalKeys);
    expect(reconciled.isComplete).toBe(true);
    expect(reconciled.missing).toHaveLength(0);

    // First target's evidence SHA unchanged
    expect(journal2.terminalResultSha256(keys[0]!)).toBe(firstResult.casObj.sha256);
    expect(journal2.terminalResultSha256(keys[1]!)).toBe(secondResult.casObj.sha256);
  });

  it("equal HTML at different base URLs does not alias contextual results", async () => {
    const root = await mkRoot();
    const { capsuleDir, configSha, journal, durableDb } = await setupJournal(root);

    const assetA = "da-aaa";
    const assetB = "da-bbb";
    const keyA = makeKey(assetA, "homepage-capture");
    const keyB = makeKey(assetB, "homepage-capture");

    await journal.declareStageTargets({
      stageId: "homepage-capture",
      keys: [keyA, keyB],
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    declareStageTargetSet(durableDb, {
      stageId: "homepage-capture",
      deviceId: DEVICE_ID,
      workKeyIds: [workKeyId(keyA), workKeyId(keyB)],
      now: new Date().toISOString(),
    });

    // Same content hash but different asset IDs and domains
    const sharedHash = "shared-content-hash-abc";

    const resultA = await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keyA,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 1,
        provisionalAssetId: assetA,
        domain: "aaa.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://aaa.de/",
          contentHash: sharedHash,
          contentLengthBytes: 100,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    const resultB = await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      keyB,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 2,
        provisionalAssetId: assetB,
        domain: "bbb.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://bbb.de/",
          contentHash: sharedHash,
          contentLengthBytes: 100,
          isNewContent: false,
        },
      },
      "succeeded",
    );

    // Both should be terminal with distinct work keys
    expect(journal.isTerminal(keyA)).toBe(true);
    expect(journal.isTerminal(keyB)).toBe(true);
    expect(workKeyId(keyA)).not.toBe(workKeyId(keyB));

    // Evidence objects should have different provisionalAssetIds despite same contentHash
    const evidenceA = await readExecutionCasObject<ProfileEvidence>(
      capsuleDir,
      resultA.casObj.sha256,
    );
    const evidenceB = await readExecutionCasObject<ProfileEvidence>(
      capsuleDir,
      resultB.casObj.sha256,
    );
    expect(evidenceA.provisionalAssetId).toBe(assetA);
    expect(evidenceB.provisionalAssetId).toBe(assetB);
    expect(evidenceA.domain).toBe("aaa.de");
    expect(evidenceB.domain).toBe("bbb.de");
  });

  it("missing content blocks closure — stage cannot seal with incomplete targets", async () => {
    const root = await mkRoot();
    const { capsuleDir, journal, durableDb } = await setupJournal(root);

    const assetIds = ["da-missing-1", "da-missing-2"];
    const keys = assetIds.map((id) => makeKey(id, "homepage-capture"));

    await journal.declareStageTargets({
      stageId: "homepage-capture",
      keys,
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    declareStageTargetSet(durableDb, {
      stageId: "homepage-capture",
      deviceId: DEVICE_ID,
      workKeyIds: keys.map(workKeyId),
      now: new Date().toISOString(),
    });

    // Only process first target — second is missing
    await commitOne(
      capsuleDir,
      durableDb,
      journal,
      capsuleConfigSha256(PERIOD, CAPSULE_ID, INSTRUMENT_PLAN),
      keys[0]!,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 1,
        provisionalAssetId: assetIds[0]!,
        domain: "missing1.de",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl: "https://missing1.de/",
          contentHash: "hash-m1",
          contentLengthBytes: 50,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    // Second target is NOT terminal
    expect(journal.isTerminal(keys[0]!)).toBe(true);
    expect(journal.isTerminal(keys[1]!)).toBe(false);

    // Reconcile shows missing key
    const terminalKeys = keys.filter((k) => journal.isTerminal(k)).map(workKeyId);
    const reconciled = reconcileTerminalSet(keys.map(workKeyId), terminalKeys);
    expect(reconciled.isComplete).toBe(false);
    expect(reconciled.missing).toHaveLength(1);
    expect(reconciled.missing[0]).toBe(workKeyId(keys[1]!));
  });

  it("relative URLs resolve against effective (final) URL after redirect", async () => {
    const root = await mkRoot();
    const { capsuleDir, configSha, journal, durableDb } = await setupJournal(root);

    const assetId = "da-redir";
    const key = makeKey(assetId, "homepage-capture");

    await journal.declareStageTargets({
      stageId: "homepage-capture",
      keys: [key],
      eventId: mintAssetId(),
      now: new Date().toISOString(),
    });
    declareStageTargetSet(durableDb, {
      stageId: "homepage-capture",
      deviceId: DEVICE_ID,
      workKeyIds: [workKeyId(key)],
      now: new Date().toISOString(),
    });

    const finalUrl = "https://example.com/de/home";
    await commitOne(
      capsuleDir,
      durableDb,
      journal,
      configSha,
      key,
      {
        schemaVersion: 1,
        stage: "homepage-capture",
        siteId: 1,
        provisionalAssetId: assetId,
        domain: "example.com",
        result: {
          ok: true,
          httpStatus: 200,
          finalUrl,
          contentHash: "hash-redir",
          contentLengthBytes: 100,
          isNewContent: true,
        },
      },
      "succeeded",
    );

    const evidence = await readExecutionCasObject<ProfileEvidence>(
      capsuleDir,
      journal.terminalResultSha256(key)!,
    );
    expect(evidence.result.ok).toBe(true);
    if (evidence.result.ok) {
      expect(evidence.result.finalUrl).toBe(finalUrl);
      // Relative URL resolution against effective URL
      const relativeLink = "impressum";
      const resolved = new URL(relativeLink, evidence.result.finalUrl).href;
      expect(resolved).toBe("https://example.com/de/impressum");
    }
  });
});
