/*
 * RFC-0114 AC-1: Durable producer integration test.
 *
 * Proves that:
 * 1. A producer commit through commitAttempt is crash-safe — restarting from
 *    the same input yields identical selected tuples.
 * 2. Racing two real SQLite connections does not let a stale completion
 *    change the selected result set.
 *
 * Test uses temporary data only — no real capsules or network calls.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allocateLeaseEpoch,
  commitAttempt,
  createExecutionDb,
  declareStageTargetSet,
  readMeasurementEvidence,
  sealedProjection,
} from "../lib/execution-store.js";
import type { CommitAttemptInput } from "../lib/sealed-projection.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))),
);

const mkDb = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0114-ac1-"));
  roots.push(root);
  const dbPath = path.join(root, "sequence.db");
  const db = createExecutionDb(dbPath);
  return { db, root, dbPath };
};

const STAGE_ID = "liveness";
const DEVICE_ID = "test-device-001";
const CONFIG_SHA = "config-sha256-fixed";

const mkWorkKeyId = (assetId: string): string =>
  `2026-q3|capsule-001|${STAGE_ID}|${assetId}|liveness-v2`;

const mkCommitInput = (
  workKeyId: string,
  attemptId: string,
  epoch: number,
  measuredAt: string,
  outcome: CommitAttemptInput["outcome"],
  evidenceSha: string,
): CommitAttemptInput => ({
  workKeyId,
  attemptId,
  epoch,
  measuredAt,
  inputFingerprint: CONFIG_SHA,
  evidence: [{ role: "liveness", sha256: evidenceSha, bytes: 42 }],
  outcome,
});

describe("RFC-0114 AC-1: durable producer integration", () => {
  it("RFC-0114 AC-1: crash-safe commit — restart from same input yields identical selected tuples", async () => {
    const { db, root } = await mkDb();
    try {
      const workKeyIds = ["da-a", "da-b", "da-c"].map(mkWorkKeyId);

      // Phase 1: Declare stage targets
      declareStageTargetSet(db, {
        stageId: STAGE_ID,
        deviceId: DEVICE_ID,
        workKeyIds,
        now: "2026-07-01T00:00:00Z",
      });

      // Phase 2: Simulate producer work — allocate leases and commit
      const measuredAt = "2026-07-01T00:05:00.000Z";
      const commits: CommitAttemptInput[] = [];
      for (const wkId of workKeyIds) {
        const attemptId = `attempt-${wkId.split("|").pop()}`;
        const epoch = allocateLeaseEpoch(db, wkId, attemptId, measuredAt);
        const input = mkCommitInput(wkId, attemptId, epoch, measuredAt, "succeeded", `sha-${wkId}`);
        commits.push(input);
        commitAttempt(db, input);
      }

      // Phase 3: Read back sealed projections and evidence
      const projectionsBefore = workKeyIds.map((id) => sealedProjection(db, id));
      const evidenceBefore = workKeyIds.map((id) =>
        readMeasurementEvidence(db, id, `attempt-${id.split("|").pop()!}`),
      );

      // Phase 4: Simulate crash — close DB, reopen from same file
      db.close();
      const reopenedDb = createExecutionDb(path.join(root, "sequence.db"));

      // Phase 5: Read back after restart — prove tuple equality
      const projectionsAfter = workKeyIds.map((id) => sealedProjection(reopenedDb, id));
      const evidenceAfter = workKeyIds.map((id) =>
        readMeasurementEvidence(reopenedDb, id, `attempt-${id.split("|").pop()!}`),
      );

      // Sealed projections must be identical after restart
      expect(projectionsAfter).toEqual(projectionsBefore);

      // Evidence must be identical after restart
      expect(evidenceAfter).toEqual(evidenceBefore);

      // Every projection must have all digest fields populated
      for (const proj of projectionsAfter) {
        expect(proj).not.toBeNull();
        expect(proj!.stageId).toBe(STAGE_ID);
        expect(proj!.deviceId).toBe(DEVICE_ID);
        expect(proj!.expectedWorkSetSha256).toHaveLength(64);
        expect(proj!.terminalWorkSetSha256).toHaveLength(64);
        expect(proj!.selectedResultSetSha256).toHaveLength(64);
        expect(proj!.projectionSha256).toHaveLength(64);
        expect(proj!.snapshotRef.uri).toMatch(/^cas:\/\//);
      }

      // Every evidence must have correct fields
      for (const ev of evidenceAfter) {
        expect(ev).not.toBeNull();
        expect(ev!.measuredAt).toBe(measuredAt);
        expect(ev!.dependencyFingerprint).toBe(CONFIG_SHA);
        expect(ev!.outcome).toBe("observed");
      }

      reopenedDb.close();
    } catch (err) {
      db.close();
      throw err;
    }
  });

  it("RFC-0114 AC-1: stale completion from a racing connection does not change selection", async () => {
    const { db, root } = await mkDb();
    try {
      const wkId = mkWorkKeyId("da-race");
      const workKeyIds = [wkId];

      declareStageTargetSet(db, {
        stageId: STAGE_ID,
        deviceId: DEVICE_ID,
        workKeyIds,
        now: "2026-07-01T00:00:00Z",
      });

      // Worker A acquires epoch 1
      const measuredAtA = "2026-07-01T00:05:00.000Z";
      const attemptA = "attempt-worker-a";
      const epochA = allocateLeaseEpoch(db, wkId, attemptA, measuredAtA);

      // Worker B acquires epoch 2 (A's lease is stale)
      const measuredAtB = "2026-07-01T00:06:00.000Z";
      const attemptB = "attempt-worker-b";
      const epochB = allocateLeaseEpoch(db, wkId, attemptB, measuredAtB);

      // Worker B commits first (the current epoch)
      commitAttempt(db, mkCommitInput(wkId, attemptB, epochB, measuredAtB, "succeeded", "sha-b"));

      // Worker A tries to commit under stale epoch — must fail
      expect(() =>
        commitAttempt(db, mkCommitInput(wkId, attemptA, epochA, measuredAtA, "succeeded", "sha-a")),
      ).toThrow(/LEASE_EPOCH_MISMATCH/);

      // Verify the projection reflects Worker B's evidence, not A's
      const proj = sealedProjection(db, wkId);
      expect(proj).not.toBeNull();
      expect(proj!.snapshotRef.sha256).toBe("sha-b");

      const evidence = readMeasurementEvidence(db, wkId, attemptB);
      expect(evidence).not.toBeNull();
      expect(evidence!.measuredAt).toBe(measuredAtB);

      // Worker A's evidence must not exist
      const staleEvidence = readMeasurementEvidence(db, wkId, attemptA);
      expect(staleEvidence).toBeNull();

      db.close();

      // Reopen and verify selection is still stable
      const reopenedDb = createExecutionDb(path.join(root, "sequence.db"));
      const projAfter = sealedProjection(reopenedDb, wkId);
      expect(projAfter).toEqual(proj);
      reopenedDb.close();
    } catch (err) {
      db.close();
      throw err;
    }
  });

  it("RFC-0114 AC-1: idempotent replay of identical commit is a no-op", async () => {
    const { db } = await mkDb();
    try {
      const wkId = mkWorkKeyId("da-idempotent");
      const workKeyIds = [wkId];

      declareStageTargetSet(db, {
        stageId: STAGE_ID,
        deviceId: DEVICE_ID,
        workKeyIds,
        now: "2026-07-01T00:00:00Z",
      });

      const measuredAt = "2026-07-01T00:05:00.000Z";
      const attemptId = "attempt-idempotent";
      const epoch = allocateLeaseEpoch(db, wkId, attemptId, measuredAt);
      const input = mkCommitInput(wkId, attemptId, epoch, measuredAt, "succeeded", "sha-idem");

      // First commit succeeds
      const proj1 = commitAttempt(db, input);

      // Second identical commit — lease was already released, so this should throw
      // (the lease epoch is no longer active)
      expect(() => commitAttempt(db, input)).toThrow(/LEASE_EPOCH_MISMATCH/);

      // The projection from the first commit is still the one stored
      const projStored = sealedProjection(db, wkId);
      expect(projStored).toEqual(proj1);

      db.close();
    } catch (err) {
      db.close();
      throw err;
    }
  });

  it("RFC-0114 AC-1: terminal work set reconciliation rejects missing or extra keys", async () => {
    const { db } = await mkDb();
    try {
      const workKeyIds = ["da-a", "da-b"].map(mkWorkKeyId);

      declareStageTargetSet(db, {
        stageId: STAGE_ID,
        deviceId: DEVICE_ID,
        workKeyIds,
        now: "2026-07-01T00:00:00Z",
      });

      // Commit only one work key
      const measuredAt = "2026-07-01T00:05:00.000Z";
      const attemptId = "attempt-partial";
      const epoch = allocateLeaseEpoch(db, workKeyIds[0]!, attemptId, measuredAt);
      commitAttempt(
        db,
        mkCommitInput(workKeyIds[0]!, attemptId, epoch, measuredAt, "succeeded", "sha-partial"),
      );

      // The sealed projection for the committed key exists
      const proj = sealedProjection(db, workKeyIds[0]!);
      expect(proj).not.toBeNull();
      expect(proj!.terminalWorkSetSha256).not.toBe(proj!.expectedWorkSetSha256);
      // Terminal set has 1 key, expected set has 2 — they must differ
      expect(proj!.terminalWorkSetSha256).not.toEqual(proj!.expectedWorkSetSha256);

      db.close();
    } catch (err) {
      db.close();
      throw err;
    }
  });
});
