import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { ExecutionEventStore, QuarterExecutionJournal, rebuildExecution, verifyQuarterExecutionClosure, writeExecutionCasObject, type ExecutionEvent } from "../lib/execution-store.js";
import type { WorkKey } from "../lib/quarter-contracts.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

const config = "a".repeat(64);
const generated = generateSigningKey();
const signingKey = { ...generated, signingKeyId: "device-a-test", collectorId: "device-a" };
const key: WorkKey = {
  period: "2026-q3",
  capsuleId: "019c0000-0000-7000-8000-000000000001",
  stageId: "liveness",
  provisionalAssetId: "da-a",
  instrumentVersion: "liveness-v2",
};
const event = (overrides: Partial<ExecutionEvent>): ExecutionEvent => ({
  eventId: "019c0000-0000-7000-8000-000000000010",
  eventAt: "2026-07-01T00:00:00.000Z",
  eventType: "capsule-configured",
  capsuleConfigSha256: config,
  ...overrides,
});

describe("append-only execution store", () => {
  it("rebuilds the same deterministic journal regardless of directory enumeration order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-")); roots.push(root);
    const store = new ExecutionEventStore(root);
    const configured = event({});
    const leased = event({ eventId: "019c0000-0000-7000-8000-000000000011", eventAt: "2026-07-01T00:00:01.000Z", eventType: "attempt-state", key, attemptId: "019c0000-0000-7000-8000-000000000020", ordinal: 1, state: "leased", leaseOwner: "device-a", leaseExpiresAt: "2026-07-01T00:10:01.000Z" });
    const succeeded = event({ eventId: "019c0000-0000-7000-8000-000000000012", eventAt: "2026-07-01T00:00:02.000Z", eventType: "attempt-state", key, attemptId: leased.attemptId, ordinal: 1, state: "succeeded", resultSha256: "b".repeat(64) });
    await store.append(configured); await store.append(leased); await store.append(succeeded);
    await expect(store.append(succeeded)).resolves.toMatch(/\.json$/);
    const disk = await store.rebuild();
    const memory = rebuildExecution([succeeded, configured, leased]);
    expect(disk.journalSha256).toBe(memory.journalSha256);
    expect([...disk.work.values()][0]?.attempts[0]?.state).toBe("succeeded");
  });

  it("rejects configuration drift, success without CAS hash, and event corruption", async () => {
    expect(() => rebuildExecution([event({}), event({ eventId: "x", capsuleConfigSha256: "b".repeat(64) })])).toThrow(/configuration changed/);
    expect(() => rebuildExecution([event({}), event({ eventId: "y", eventType: "attempt-state", key, attemptId: "a", ordinal: 1, state: "succeeded" })])).toThrow(/result hash/);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-")); roots.push(root);
    const store = new ExecutionEventStore(root);
    const file = await store.append(event({}));
    await fs.writeFile(file, "{}\n", "utf8");
    await expect(store.readAll()).rejects.toThrow(/checksum mismatch/);
  });

  it("resumes terminal work without creating another attempt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-")); roots.push(root);
    const eventsDir = path.join(root, "staging", "execution", "events");
    const journal = new QuarterExecutionJournal(eventsDir, config, signingKey);
    await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
    await journal.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets-a", now: "2026-07-01T00:00:00.500Z" });
    await expect(fs.readFile(path.join(root, "staging", "targets", "liveness.json"), "utf8")).resolves.toContain('"targetSetSha256"');
    const attempt = await journal.begin({ key, attemptId: "attempt-a", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:10:01.000Z" });
    expect(attempt).not.toBeNull();
    await journal.finish(attempt!, { eventId: "finished-a", now: "2026-07-01T00:00:02.000Z", state: "succeeded", resultSha256: "c".repeat(64) });
    const seal = await journal.sealStage({ stageId: "liveness", keys: [key], eventId: "seal-a", now: "2026-07-01T00:00:03.000Z" });
    expect(seal).toMatchObject({ succeeded: 1, observedFailures: 0 });
    const stageSealPath = path.join(root, "staging", "stage-seals", "liveness.json");
    await expect(fs.readFile(stageSealPath, "utf8")).resolves.toContain('"signature"');
    await expect(journal.sealStage({ stageId: "liveness", keys: [key], eventId: "seal-retry", now: "2026-07-01T00:00:04.000Z" })).resolves.toEqual(seal);
    const signedSeal = JSON.parse(await fs.readFile(stageSealPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(stageSealPath, `${JSON.stringify({ ...signedSeal, collectorId: "forged" })}\n`);
    await expect(journal.sealStage({ stageId: "liveness", keys: [key], eventId: "seal-tampered", now: "2026-07-01T00:00:05.000Z" })).rejects.toThrow(/signed seal is invalid/);
    const resumed = new QuarterExecutionJournal(eventsDir, config);
    await resumed.initialize("ignored", "2026-07-02T00:00:00.000Z");
    await expect(resumed.begin({ key, attemptId: "attempt-b", leaseOwner: "device-a", now: "2026-07-02T00:00:01.000Z", leaseExpiresAt: "2026-07-02T00:10:01.000Z" })).resolves.toBeNull();
    expect((await new ExecutionEventStore(eventsDir).readAll())).toHaveLength(5);
  });

  it("freezes the complete stage target set before work and rejects drift", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-")); roots.push(root);
    const journal = new QuarterExecutionJournal(path.join(root, "events"), config);
    await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
    await journal.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets-a", now: "2026-07-01T00:00:00.500Z" });
    const changed = { ...key, provisionalAssetId: "da-b" as const };
    const wrongStage = { ...key, stageId: "profile" as const };
    await expect(journal.declareStageTargets({ stageId: "liveness", keys: [wrongStage], eventId: "targets-wrong-stage", now: "2026-07-01T00:00:00.550Z" })).rejects.toThrow(/another stage/);
    await expect(journal.declareStageTargets({ stageId: "liveness", keys: [key, changed], eventId: "targets-b", now: "2026-07-01T00:00:00.600Z" })).rejects.toThrow(/target set changed/);
    await expect(journal.sealStage({ stageId: "liveness", keys: [key], eventId: "seal-a", now: "2026-07-01T00:00:01.000Z" })).rejects.toThrow(/incomplete/);
  });

  it("commits immutable CAS evidence idempotently before result events", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-")); roots.push(root);
    const first = await writeExecutionCasObject(root, { b: 2, a: 1 });
    const retry = await writeExecutionCasObject(root, { a: 1, b: 2 });
    expect(retry).toEqual(first);
    expect(await fs.readFile(first.path, "utf8")).toBe('{"a":1,"b":2}\n');
  });

  it("refuses publication unless signed stage evidence proves every frozen target", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-closure-")); roots.push(root);
    const journal = new QuarterExecutionJournal(path.join(root, "staging", "execution", "events"), config, signingKey);
    await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
    await journal.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets", now: "2026-07-01T00:00:00.100Z" });
    await expect(verifyQuarterExecutionClosure(root, ["liveness"], new Map([[signingKey.signingKeyId, signingKey]]))).rejects.toThrow();
    const attempt = await journal.begin({ key, attemptId: "attempt", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:01:01.000Z" });
    const evidence = await writeExecutionCasObject(root, {
      schemaVersion: 1,
      stage: "liveness",
      provisionalAssetId: key.provisionalAssetId,
      outcome: "reachable",
    });
    await journal.finish(attempt!, { eventId: "terminal", now: "2026-07-01T00:00:02.000Z", state: "succeeded", resultSha256: evidence.sha256 });
    await journal.sealStage({ stageId: "liveness", keys: [key], eventId: "sealed", now: "2026-07-01T00:00:03.000Z" });
    const verificationKeys = new Map([[signingKey.signingKeyId, signingKey]]);
    await expect(verifyQuarterExecutionClosure(root, ["liveness"], verificationKeys)).resolves.toBeUndefined();
    const sealPath = path.join(root, "staging", "stage-seals", "liveness.json");
    const seal = JSON.parse(await fs.readFile(sealPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(sealPath, `${JSON.stringify({ ...seal, collectorId: "forged" })}\n`);
    await expect(verifyQuarterExecutionClosure(root, ["liveness"], verificationKeys)).rejects.toThrow(/signed seal is invalid/);
  });

  it("rejects hash-valid CAS evidence bound to another asset or stage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-semantic-")); roots.push(root);
    const journal = new QuarterExecutionJournal(path.join(root, "staging", "execution", "events"), config, signingKey);
    await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
    await journal.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets", now: "2026-07-01T00:00:00.100Z" });
    const attempt = await journal.begin({ key, attemptId: "attempt", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:01:01.000Z" });
    const evidence = await writeExecutionCasObject(root, {
      schemaVersion: 1,
      stage: "profile",
      provisionalAssetId: "da-other",
      outcome: "reachable",
    });
    await journal.finish(attempt!, { eventId: "terminal", now: "2026-07-01T00:00:02.000Z", state: "succeeded", resultSha256: evidence.sha256 });
    await journal.sealStage({ stageId: "liveness", keys: [key], eventId: "sealed", now: "2026-07-01T00:00:03.000Z" });
    await expect(
      verifyQuarterExecutionClosure(root, ["liveness"], new Map([[signingKey.signingKeyId, signingKey]])),
    ).rejects.toThrow(/does not match WorkKey/);
  });

  it("recovers deterministically across every CAS and checkpoint crash boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-crash-")); roots.push(root);
    const eventsDir = path.join(root, "staging", "execution", "events");
    const first = new QuarterExecutionJournal(eventsDir, config);
    await first.initialize("configured", "2026-07-01T00:00:00.000Z");
    await first.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets", now: "2026-07-01T00:00:00.100Z" });

    // Crash before CAS: an abandoned lease is not terminal and a new attempt is allowed.
    const abandonedBeforeCas = await first.begin({ key, attemptId: "attempt-before-cas", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:01:01.000Z" });
    expect(abandonedBeforeCas?.ordinal).toBe(1);
    const afterBeforeCasCrash = new QuarterExecutionJournal(eventsDir, config);
    await afterBeforeCasCrash.initialize("ignored", "2026-07-01T00:02:00.000Z");
    const abandonedAfterCas = await afterBeforeCasCrash.begin({ key, attemptId: "attempt-after-cas", leaseOwner: "device-a", now: "2026-07-01T00:02:01.000Z", leaseExpiresAt: "2026-07-01T00:03:01.000Z" });
    expect(abandonedAfterCas?.ordinal).toBe(2);

    // Crash after CAS but before terminal event: evidence is harmlessly reused by the next attempt.
    const evidence = await writeExecutionCasObject(root, { outcome: "reachable" });
    const afterCasCrash = new QuarterExecutionJournal(eventsDir, config);
    await afterCasCrash.initialize("ignored-again", "2026-07-01T00:04:00.000Z");
    const selected = await afterCasCrash.begin({ key, attemptId: "attempt-selected", leaseOwner: "device-a", now: "2026-07-01T00:04:01.000Z", leaseExpiresAt: "2026-07-01T00:05:01.000Z" });
    expect(selected?.ordinal).toBe(3);
    await afterCasCrash.finish(selected!, { eventId: "terminal", now: "2026-07-01T00:04:02.000Z", state: "succeeded", resultSha256: evidence.sha256 });

    // Crash after terminal event but before mutable checkpoint: restart selects CAS and forbids network work.
    const afterEventCrash = new QuarterExecutionJournal(eventsDir, config);
    await afterEventCrash.initialize("ignored-third", "2026-07-01T00:06:00.000Z");
    expect(afterEventCrash.terminalResultSha256(key)).toBe(evidence.sha256);
    await expect(afterEventCrash.begin({ key, attemptId: "must-not-run", leaseOwner: "device-a", now: "2026-07-01T00:06:01.000Z", leaseExpiresAt: "2026-07-01T00:07:01.000Z" })).resolves.toBeNull();
  });

  it("grants one cross-process lease and fences an expired owner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-concurrent-")); roots.push(root);
    const eventsDir = path.join(root, "events");
    const first = new QuarterExecutionJournal(eventsDir, config);
    const second = new QuarterExecutionJournal(eventsDir, config);
    await Promise.all([
      first.initialize("configured-a", "2026-07-01T00:00:00.000Z"),
      second.initialize("configured-b", "2026-07-01T00:00:00.001Z"),
    ]);
    await first.declareStageTargets({ stageId: "liveness", keys: [key], eventId: "targets", now: "2026-07-01T00:00:00.100Z" });
    const [leaseA, leaseB] = await Promise.all([
      first.begin({ key, attemptId: "attempt-a", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:01:01.000Z" }),
      second.begin({ key, attemptId: "attempt-b", leaseOwner: "device-b", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:01:01.000Z" }),
    ]);
    expect([leaseA, leaseB].filter(Boolean)).toHaveLength(1);
    const winner = leaseA ?? leaseB!;
    const winnerJournal = leaseA ? first : second;
    await winnerJournal.finish(winner, { eventId: "terminal", now: "2026-07-01T00:00:02.000Z", state: "succeeded", resultSha256: "d".repeat(64) });
    await expect((leaseA ? second : first).begin({ key, attemptId: "must-not-run", leaseOwner: "device-c", now: "2026-07-01T00:00:03.000Z", leaseExpiresAt: "2026-07-01T00:01:03.000Z" })).resolves.toBeNull();

    const expiringKey = { ...key, provisionalAssetId: "da-expiring" as const };
    const expiringOwner = await first.begin({ key: expiringKey, attemptId: "expired-owner", leaseOwner: "device-a", now: "2026-07-01T01:00:00.000Z", leaseExpiresAt: "2026-07-01T01:00:01.000Z" });
    const replacement = await second.begin({ key: expiringKey, attemptId: "replacement", leaseOwner: "device-b", now: "2026-07-01T01:00:02.000Z", leaseExpiresAt: "2026-07-01T01:01:02.000Z" });
    expect(replacement).not.toBeNull();
    await expect(first.finish(expiringOwner!, { eventId: "stale-terminal", now: "2026-07-01T01:00:03.000Z", state: "succeeded", resultSha256: "e".repeat(64) })).rejects.toThrow(/lost its execution lease/);
    await second.finish(replacement!, { eventId: "replacement-terminal", now: "2026-07-01T01:00:04.000Z", state: "succeeded", resultSha256: "f".repeat(64) });
  });

  it("keeps a live long-running attempt exclusive through append-only heartbeats", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-execution-heartbeat-")); roots.push(root);
    const eventsDir = path.join(root, "events");
    const owner = new QuarterExecutionJournal(eventsDir, config);
    const contender = new QuarterExecutionJournal(eventsDir, config);
    await owner.initialize("configured", "2026-07-01T00:00:00.000Z");
    await contender.initialize("ignored", "2026-07-01T00:00:00.001Z");
    const attempt = await owner.begin({ key, attemptId: "long-running", leaseOwner: "device-a", now: "2026-07-01T00:00:01.000Z", leaseExpiresAt: "2026-07-01T00:00:02.000Z" });
    await owner.heartbeat(attempt!, { now: "2026-07-01T00:00:01.500Z", leaseExpiresAt: "2026-07-01T00:00:03.000Z" });
    await expect(contender.begin({ key, attemptId: "too-early", leaseOwner: "device-b", now: "2026-07-01T00:00:02.500Z", leaseExpiresAt: "2026-07-01T00:00:04.000Z" })).resolves.toBeNull();
    await expect(contender.begin({ key, attemptId: "after-heartbeat", leaseOwner: "device-b", now: "2026-07-01T00:00:03.500Z", leaseExpiresAt: "2026-07-01T00:00:05.000Z" })).resolves.not.toBeNull();
  });
});
