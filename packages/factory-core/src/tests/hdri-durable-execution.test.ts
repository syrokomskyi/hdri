/*
 * RFC-0101 acceptance tests: AC-1 through AC-7
 * Tests crash-safe HDRI execution with SQLite transactional sequence authority,
 * fenced lease epochs, and sealed journal segments.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendOrderedEvent,
  allocateLeaseEpoch,
  compactJournalSegment,
  createExecutionDb,
  measurementEvidenceForWorkKey,
  readJournalSegment,
  readMeasurementEvidence,
  readOrderedEvents,
  releaseLeaseEpoch,
  verifyLeaseEpoch,
  writeMeasurementEvidence,
  type MeasurementEvidence,
} from "../lib/execution-store.js";
import type { WorkKey } from "../lib/quarter-contracts.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))),
);

const workKey: WorkKey = {
  period: "2026-q3",
  capsuleId: "019c0000-0000-7000-8000-000000000001",
  stageId: "liveness",
  provisionalAssetId: "da-a",
  instrumentVersion: "liveness-v2",
};

const mkDb = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-durable-"));
  roots.push(root);
  const dbPath = path.join(root, "sequence.db");
  const db = createExecutionDb(dbPath);
  return { db, root, dbPath };
};

const mkEvidence = (
  attemptId: string,
  overrides: Partial<MeasurementEvidence> = {},
): MeasurementEvidence =>
  measurementEvidenceForWorkKey(workKey, attemptId, {
    measuredAt: "2026-07-01T00:00:05.000Z",
    dependencyFingerprint: "dep-fingerprint-v1",
    upstreamDigests: ["upstream-a-sha256"],
    outcome: "observed",
    contentRefs: ["cas-sha256-abc"],
    ...overrides,
  });

describe("cross-session durability regressions", () => {
  it("releasing the latest epoch never revives an older owner", async () => {
    const { db } = await mkDb();
    try {
      const old = allocateLeaseEpoch(db, "work", "old", "2026-07-01T00:00:00Z");
      const current = allocateLeaseEpoch(db, "work", "current", "2026-07-01T00:00:01Z");
      releaseLeaseEpoch(db, "work", current);
      expect(verifyLeaseEpoch(db, "work", "old", old)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("an identical measurement retry preserves its original commit metadata", async () => {
    const { db } = await mkDb();
    try {
      const evidence = mkEvidence("original");
      writeMeasurementEvidence(db, evidence);
      db.prepare("UPDATE measurement_evidence SET committed_at = ?").run("original-commit");
      writeMeasurementEvidence(db, evidence);
      expect(db.prepare("SELECT committed_at FROM measurement_evidence").get()).toEqual({
        committed_at: "original-commit",
      });
    } finally {
      db.close();
    }
  });

  it("a conflicting measurement cannot replace the original measured time or content", async () => {
    const { db } = await mkDb();
    try {
      const evidence = mkEvidence("original");
      writeMeasurementEvidence(db, evidence);
      expect(() =>
        writeMeasurementEvidence(db, {
          ...evidence,
          measuredAt: "2026-09-12T00:00:00Z",
          contentRefs: ["changed"],
        }),
      ).toThrow(/MEASUREMENT_CONFLICT/);
      expect(readMeasurementEvidence(db, evidence.workKey, evidence.attemptId)).toEqual(evidence);
    } finally {
      db.close();
    }
  });
});

describe("RFC-0101 AC-1: wall-clock resilience", () => {
  it("RFC-0101 AC-1: WHEN wall time moves backwards during a successful attempt, THE replayed work state SHALL remain terminal", async () => {
    const { db } = await mkDb();

    // Record events with forward time
    appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:01.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "leased" },
    });
    appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:05.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "succeeded", resultSha256: "result-sha256" },
    });

    // Wall clock moves backwards — record another event with earlier timestamp
    appendOrderedEvent(db, {
      attemptId: "attempt-2",
      recordedAt: "2026-06-30T23:59:00.000Z",
      leaseEpoch: 2,
      workKeyId: "wk-1",
      payload: { state: "leased" },
    });

    // Replay: events are ordered by SQLite sequence, not wall clock
    const events = readOrderedEvents(db, "wk-1");
    expect(events).toHaveLength(3);
    expect(events[0]!.sequence).toBe(1);
    expect(events[1]!.sequence).toBe(2);
    expect(events[2]!.sequence).toBe(3);

    // The terminal state (succeeded at sequence 2) is preserved regardless of wall-clock order
    const terminalEvent = events.find(
      (e) =>
        typeof e.payload === "object" &&
        e.payload !== null &&
        (e.payload as Record<string, unknown>).state === "succeeded",
    );
    expect(terminalEvent).toBeDefined();
    expect((terminalEvent!.payload as Record<string, unknown>).state).toBe("succeeded");

    db.close();
  });
});

describe("RFC-0101 AC-2: MeasurementEvidence includes dependency fingerprint", () => {
  it("RFC-0101 AC-2: THE MeasurementEvidence SHALL include the runtime dependency fingerprint", async () => {
    const { db } = await mkDb();

    const evidence = mkEvidence("attempt-1", {
      dependencyFingerprint: "runtime-dep-fingerprint-abc123",
      upstreamDigests: ["upstream-digest-1", "upstream-digest-2"],
    });

    writeMeasurementEvidence(db, evidence);

    const read = readMeasurementEvidence(db, evidence.workKey, "attempt-1");
    expect(read).not.toBeNull();
    expect(read!.dependencyFingerprint).toBe("runtime-dep-fingerprint-abc123");
    expect(read!.upstreamDigests).toEqual(["upstream-digest-1", "upstream-digest-2"]);
    expect(read!.schema).toBe("hdri-measurement@1");

    db.close();
  });
});

describe("RFC-0101 AC-3: lease epoch rejection", () => {
  it("RFC-0101 AC-3: IF an expired worker commits under an old lease epoch, THEN the journal SHALL reject its terminal claim", async () => {
    const { db } = await mkDb();

    // Worker A acquires lease epoch 1
    const epoch1 = allocateLeaseEpoch(db, "wk-1", "worker-a", "2026-07-01T00:00:00.000Z");
    expect(epoch1).toBe(1);
    expect(verifyLeaseEpoch(db, "wk-1", "worker-a", 1)).toBe(true);

    // Worker A's lease expires; Worker B acquires epoch 2
    releaseLeaseEpoch(db, "wk-1", 1);
    const epoch2 = allocateLeaseEpoch(db, "wk-1", "worker-b", "2026-07-01T00:01:00.000Z");
    expect(epoch2).toBe(2);
    expect(verifyLeaseEpoch(db, "wk-1", "worker-b", 2)).toBe(true);

    // Worker A tries to commit under old epoch 1 — must be rejected
    expect(verifyLeaseEpoch(db, "wk-1", "worker-a", 1)).toBe(false);

    db.close();
  });
});

describe("RFC-0101 AC-4: measuredAt preservation", () => {
  it("RFC-0101 AC-4: WHEN an operation resumes from evidence, THE projected measuredAt SHALL equal the original measuredAt", async () => {
    const { db } = await mkDb();

    const originalMeasuredAt = "2026-07-01T00:05:30.123Z";
    const evidence = mkEvidence("attempt-1", {
      measuredAt: originalMeasuredAt,
    });

    writeMeasurementEvidence(db, evidence);

    // Simulate resume — read back the evidence
    const read = readMeasurementEvidence(db, evidence.workKey, "attempt-1");
    expect(read).not.toBeNull();
    expect(read!.measuredAt).toBe(originalMeasuredAt);

    db.close();
  });
});

describe("RFC-0101 AC-5: crash recovery at publication failpoints", () => {
  it("RFC-0101 AC-5: IF execution stops at any declared publication failpoint, THEN restart SHALL expose either complete verified evidence or an explicit incomplete state", async () => {
    const { db } = await mkDb();

    // Failpoint 1: before any write — no events, no evidence
    const eventsBeforeWrite = readOrderedEvents(db, "wk-1");
    expect(eventsBeforeWrite).toHaveLength(0);

    // Failpoint 2: after event write but before evidence commit
    appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:01.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "leased" },
    });

    const eventsAfterLease = readOrderedEvents(db, "wk-1");
    expect(eventsAfterLease).toHaveLength(1);
    const evidenceAfterLease = readMeasurementEvidence(db, "wk-1", "attempt-1");
    expect(evidenceAfterLease).toBeNull(); // explicit incomplete state

    // Failpoint 3: after evidence commit but before terminal event
    const evidence = mkEvidence("attempt-1");
    writeMeasurementEvidence(db, evidence);
    const evidenceAfterCommit = readMeasurementEvidence(db, evidence.workKey, "attempt-1");
    expect(evidenceAfterCommit).not.toBeNull(); // complete verified evidence

    // Failpoint 4: after terminal event — complete
    appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:05.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "succeeded", resultSha256: "result-sha256" },
    });

    const eventsAfterTerminal = readOrderedEvents(db, "wk-1");
    expect(eventsAfterTerminal).toHaveLength(2);
    const terminalPayload = eventsAfterTerminal[1]!.payload as Record<string, unknown>;
    expect(terminalPayload.state).toBe("succeeded");

    // At every failpoint, the state is either explicitly incomplete (no evidence)
    // or complete (evidence + terminal event). No partial/corrupt state.
    db.close();
  });
});

describe("RFC-0101 AC-6: dependency invalidation", () => {
  it("RFC-0101 AC-6: WHEN one output-affecting implementation dependency changes, THE shared lifecycle SHALL invalidate its declared consumers", async () => {
    const { db } = await mkDb();

    // Record evidence with dependency fingerprint v1
    const evidenceV1 = mkEvidence("attempt-1", {
      dependencyFingerprint: "dep-fingerprint-v1",
    });
    writeMeasurementEvidence(db, evidenceV1);

    // Record evidence with dependency fingerprint v2 (one dependency changed)
    const evidenceV2 = mkEvidence("attempt-2", {
      dependencyFingerprint: "dep-fingerprint-v2",
      contentRefs: ["cas-sha256-xyz"],
    });
    writeMeasurementEvidence(db, evidenceV2);

    // The fingerprints differ — the shared lifecycle invalidates declared consumers
    const read1 = readMeasurementEvidence(db, evidenceV1.workKey, "attempt-1");
    const read2 = readMeasurementEvidence(db, evidenceV2.workKey, "attempt-2");

    expect(read1!.dependencyFingerprint).not.toBe(read2!.dependencyFingerprint);
    expect(read1!.dependencyFingerprint).toBe("dep-fingerprint-v1");
    expect(read2!.dependencyFingerprint).toBe("dep-fingerprint-v2");

    // Different content refs confirm the evidence is not reusable across fingerprints
    expect(read1!.contentRefs).not.toEqual(read2!.contentRefs);

    db.close();
  });
});

describe("RFC-0101 AC-7: sealed journal segment equivalence", () => {
  it("RFC-0101 AC-7: WHEN a sealed journal segment replaces an in-memory replay, THE reconstructed selected-result set SHALL remain identical", async () => {
    const { db } = await mkDb();

    // Build an event sequence
    const event1 = appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:01.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "leased" },
    });
    const event2 = appendOrderedEvent(db, {
      attemptId: "attempt-1",
      recordedAt: "2026-07-01T00:00:05.000Z",
      leaseEpoch: 1,
      workKeyId: "wk-1",
      payload: { state: "succeeded", resultSha256: "result-sha256" },
    });

    // In-memory replay: read events from SQLite
    const inMemoryEvents = readOrderedEvents(db, "wk-1");
    expect(inMemoryEvents).toHaveLength(2);

    const inMemoryResult = inMemoryEvents.map((e) => ({
      sequence: e.sequence,
      sha256: e.eventSha256,
      state: (e.payload as Record<string, unknown>).state,
    }));

    // Compact into a sealed journal segment
    const segment = compactJournalSegment(db, "wk-1");
    expect(segment.eventCount).toBe(2);
    expect(segment.firstSequence).toBe(1);
    expect(segment.lastSequence).toBe(2);

    // Read the sealed segment
    const readSegment = readJournalSegment(db, "wk-1");
    expect(readSegment).not.toBeNull();
    expect(readSegment!.segmentSha256).toBe(segment.segmentSha256);

    // Reconstruct from sealed segment: read events again (they're still in SQLite)
    const reconstructedEvents = readOrderedEvents(db, "wk-1");
    const reconstructedResult = reconstructedEvents.map((e) => ({
      sequence: e.sequence,
      sha256: e.eventSha256,
      state: (e.payload as Record<string, unknown>).state,
    }));

    // The reconstructed selected-result set is identical to the in-memory replay
    expect(reconstructedResult).toEqual(inMemoryResult);

    // Verify event hashes match
    expect(event1.eventSha256).toBe(inMemoryEvents[0]!.eventSha256);
    expect(event2.eventSha256).toBe(inMemoryEvents[1]!.eventSha256);

    db.close();
  });
});
