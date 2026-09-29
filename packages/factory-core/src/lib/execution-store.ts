/*
<MODULE_CONTRACT>
<purpose>Provides append-only, rebuildable execution evidence for safe resumable HDRI quarterly collection work.</purpose>
<non-goals><item>Does not perform network work or own stage-specific error classification.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0026 durable event journal, deterministic rebuild and configuration freeze.</item>
  <item>Add atomic cross-process leases, fencing markers and durable attempt ordinals.</item>
  <item>Add append-only heartbeats, frozen target artifacts and signed stage completeness seals.</item>
  <item>Add a public consumer verifier binding frozen targets, terminal events, CAS objects and signed stage seals.</item>
  <item>Bind each stage target set to exactly one matching declaration and stage-specific WorkKeys.</item>
  <item>RFC-0111: verified journal/index paths for resource evidence. No changes required — existing bounded reads and indexed lookups satisfy qualification harness demands.</item>
  <item>RFC-0115 B5: expose immutable authenticated selected results and verify the actual producer evidence schemas.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: terminal evidence is committed before its lease is released

import { createHash, randomUUID } from "node:crypto";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  getTransparencyKeysDir,
  loadSigningKeyFromEnv,
  loadVerificationKeys,
  type SigningKeyConfig,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import {
  canonicalResumeKey,
  sealStagesFor,
  type WorkKey,
  type WorkState,
} from "./quarter-contracts.js";
import { appendCapsuleSealArtifacts, sha256File, type CapsuleArtifact } from "./capsule.js";
import {
  assertStageComplete,
  selectTerminalResult,
  reconcileTerminalSet,
} from "./execution-journal.js";
import { canonical } from "./canonical-json.js";
import type { CommitAttemptInput, SealedProjection } from "./sealed-projection.js";

export type ExecutionEvent = Readonly<{
  eventId: string;
  eventAt: string;
  eventType: "capsule-configured" | "target-declared" | "attempt-state" | "stage-sealed";
  capsuleConfigSha256: string;
  key?: WorkKey;
  attemptId?: string;
  ordinal?: number;
  state?: Exclude<WorkState, "pending">;
  resultSha256?: string;
  errorClass?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  targetSetSha256?: string;
  targetCount?: number;
  selectedResultSetSha256?: string;
  stageId?: WorkKey["stageId"];
  succeeded?: number;
  observedFailures?: number;
  approvedExclusions?: number;
  quarantined?: number;
}>;

export type RebuiltWork = Readonly<{
  key: WorkKey;
  attempts: readonly Readonly<{
    attemptId: string;
    ordinal: number;
    state: Exclude<WorkState, "pending">;
    resultSha256?: string;
    errorClass?: string;
    leaseOwner?: string;
    leaseExpiresAt?: string;
  }>[];
}>;

export type RebuiltExecution = Readonly<{
  capsuleConfigSha256: string;
  events: number;
  work: ReadonlyMap<string, RebuiltWork>;
  journalSha256: string;
}>;

export const workKeyId = (key: WorkKey): string =>
  canonicalResumeKey([
    key.period,
    key.capsuleId,
    key.stageId,
    key.provisionalAssetId,
    key.instrumentVersion,
  ]);

/**
 * Bounded filesystem-safe name for coordination artifacts. The canonical
 * workKeyId hex can exceed NAME_MAX once lease/ordinal suffixes are appended,
 * so on-disk coordination files are named by its SHA-256 instead. The full
 * key remains the identity inside journal events and stage seals.
 */
const coordinationFileId = (id: string): string =>
  createHash("sha256").update(id, "utf8").digest("hex");

export const executionEventSha256 = (event: ExecutionEvent): string =>
  createHash("sha256").update(canonical(event)).digest("hex");

export const rebuildExecution = (events: readonly ExecutionEvent[]): RebuiltExecution => {
  const ordered = [...events].sort(
    (a, b) => a.eventAt.localeCompare(b.eventAt) || a.eventId.localeCompare(b.eventId),
  );
  const configHashes = new Set(ordered.map((event) => event.capsuleConfigSha256));
  if (configHashes.size !== 1)
    throw new Error("Capsule configuration changed after execution began");
  const configured = ordered.filter((event) => event.eventType === "capsule-configured");
  if (configured.length !== 1)
    throw new Error("Execution journal requires exactly one capsule-configured event");

  const mutable = new Map<
    string,
    { key: WorkKey; attempts: Map<string, RebuiltWork["attempts"][number]> }
  >();
  for (const event of ordered) {
    if (event.eventType !== "attempt-state") continue;
    if (!event.key || !event.attemptId || event.ordinal == null || !event.state) {
      throw new Error(`Malformed attempt event: ${event.eventId}`);
    }
    if (
      (event.state === "succeeded" || event.state === "observed-failure") &&
      !event.resultSha256
    ) {
      throw new Error(`Terminal attempt lacks immutable result hash: ${event.eventId}`);
    }
    const id = workKeyId(event.key);
    let work = mutable.get(id);
    if (!work) {
      work = { key: event.key, attempts: new Map() };
      mutable.set(id, work);
    } else if (canonical(work.key) !== canonical(event.key)) {
      throw new Error(`Work key hash collision: ${id}`);
    }
    const prior = work.attempts.get(event.attemptId);
    if (prior && event.ordinal !== prior.ordinal)
      throw new Error(`Attempt ordinal changed: ${event.attemptId}`);
    work.attempts.set(event.attemptId, {
      attemptId: event.attemptId,
      ordinal: event.ordinal,
      state: event.state,
      ...(event.resultSha256 ? { resultSha256: event.resultSha256 } : {}),
      ...(event.errorClass ? { errorClass: event.errorClass } : {}),
      ...(event.leaseOwner ? { leaseOwner: event.leaseOwner } : {}),
      ...(event.leaseExpiresAt ? { leaseExpiresAt: event.leaseExpiresAt } : {}),
    });
  }
  const work = new Map<string, RebuiltWork>();
  for (const [id, value] of mutable) {
    work.set(id, {
      key: value.key,
      attempts: [...value.attempts.values()].sort((a, b) => a.ordinal - b.ordinal),
    });
  }
  const journalSha256 = createHash("sha256")
    .update(ordered.map(executionEventSha256).join("\n"))
    .digest("hex");
  return {
    capsuleConfigSha256: configured[0]!.capsuleConfigSha256,
    events: ordered.length,
    work,
    journalSha256,
  };
};

export class ExecutionEventStore {
  constructor(private readonly eventsDir: string) {}

  async append(event: ExecutionEvent): Promise<string> {
    const digest = executionEventSha256(event);
    const target = path.join(
      this.eventsDir,
      `${event.eventAt.replaceAll(":", "-")}-${event.eventId}-${digest}.json`,
    );
    await fs.mkdir(this.eventsDir, { recursive: true });
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(target, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(await fs.readFile(target, "utf8")) as ExecutionEvent;
      if (executionEventSha256(existing) !== digest) {
        throw new Error(`Existing execution event conflicts with retry: ${event.eventId}`, {
          cause: error,
        });
      }
      return target;
    }
    try {
      await handle.writeFile(`${canonical(event)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return target;
  }

  async readAll(): Promise<ExecutionEvent[]> {
    let names: string[];
    try {
      names = (await fs.readdir(this.eventsDir)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const events: ExecutionEvent[] = [];
    for (const name of names) {
      const raw = await fs.readFile(path.join(this.eventsDir, name), "utf8");
      const event = JSON.parse(raw) as ExecutionEvent;
      if (!name.endsWith(`-${executionEventSha256(event)}.json`)) {
        throw new Error(`Execution event checksum mismatch: ${name}`);
      }
      events.push(event);
    }
    return events;
  }

  async rebuild(): Promise<RebuiltExecution> {
    return rebuildExecution(await this.readAll());
  }
}

// RFC-0128: the capsule root is a neutral shared location — apps/hdri/capsules/
// — not one app's .output/. factoryRootDir resolves to apps/hdri/factory.
export const quarterCapsuleDir = (
  factoryRootDir: string,
  deviceId: string,
  period: string,
  capsuleId: string,
): string => path.resolve(factoryRootDir, "..", "capsules", deviceId, period, capsuleId);

export const quarterExecutionEventsDir = (
  factoryRootDir: string,
  deviceId: string,
  period: string,
  capsuleId: string,
): string =>
  path.join(
    quarterCapsuleDir(factoryRootDir, deviceId, period, capsuleId),
    "staging",
    "execution",
    "events",
  );

export const writeExecutionCasObject = async (
  capsuleDir: string,
  payload: unknown,
): Promise<{ path: string; sha256: string }> => {
  const bytes = `${canonical(payload)}\n`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const target = path.join(
    capsuleDir,
    "staging",
    "execution",
    "cas",
    sha256.slice(0, 2),
    `${sha256}.json`,
  );
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await fs.readFile(target, "utf8")) !== bytes)
      throw new Error(`Execution CAS collision: ${sha256}`, { cause: error });
  }
  return { path: target, sha256 };
};

export const readExecutionCasObject = async <T>(capsuleDir: string, sha256: string): Promise<T> => {
  const target = path.join(
    capsuleDir,
    "staging",
    "execution",
    "cas",
    sha256.slice(0, 2),
    `${sha256}.json`,
  );
  const bytes = await fs.readFile(target, "utf8");
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
    throw new Error(`Execution CAS checksum mismatch: ${sha256}`);
  }
  return JSON.parse(bytes) as T;
};

export type ExecutionEvidenceEnvelope = Readonly<{
  schemaVersion: 1 | 2;
  stage: WorkKey["stageId"];
  provisionalAssetId: string;
}> &
  Readonly<Record<string, unknown>>;

// RFC-0033: This is the single semantic-check verification point. Producers must not duplicate this check.
export function assertExecutionEvidenceMatchesWorkKey(
  payload: unknown,
  key: WorkKey,
): asserts payload is ExecutionEvidenceEnvelope {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Execution evidence is not an object for ${workKeyId(key)}`);
  }
  const evidence = payload as Record<string, unknown>;
  // Producer contracts: homepage-capture emits the profile instrument envelope;
  // the browser-pool Axe collector emits schema 2 with browser evidence.
  const expectedStage = key.stageId === "homepage-capture" ? "profile" : key.stageId;
  const expectedSchema = key.stageId === "axe" ? 2 : 1;
  if (
    evidence.schemaVersion !== expectedSchema ||
    evidence.stage !== expectedStage ||
    evidence.provisionalAssetId !== key.provisionalAssetId
  ) {
    throw new Error(`Execution evidence identity does not match WorkKey ${workKeyId(key)}`);
  }
}

export type StartedAttempt = Readonly<{
  key: WorkKey;
  attemptId: string;
  ordinal: number;
}>;

export const withLeaseHeartbeat = async <T>(
  journal: QuarterExecutionJournal,
  attempt: StartedAttempt,
  leaseDurationMs: number,
  task: () => Promise<T>,
): Promise<T> => {
  const intervalMs = Math.max(1_000, Math.min(30_000, Math.floor(leaseDurationMs / 3)));
  let heartbeatError: unknown;
  const timer = setInterval(() => {
    const now = new Date();
    void journal
      .heartbeat(attempt, {
        now: now.toISOString(),
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
      })
      .catch((error: unknown) => {
        heartbeatError = error;
      });
  }, intervalMs);
  timer.unref();
  try {
    const result = await task();
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(timer);
  }
};

export type SignedStageSeal = Readonly<{
  schemaVersion: 1;
  payload: Readonly<{
    capsuleConfigSha256: string;
    stageId: WorkKey["stageId"];
    targetSetSha256: string;
    targetCount: number;
    selectedResultSetSha256: string;
    succeeded: number;
    observedFailures: number;
  }>;
  signedAt: string;
  signingKeyId: string;
  collectorId: string;
  signature: string;
}>;

export const verifySignedStageSeal = (seal: SignedStageSeal, key: VerificationKey): boolean => {
  if (seal.schemaVersion !== 1 || seal.signingKeyId !== key.signingKeyId) return false;
  const collectorId = "collectorId" in key ? key.collectorId : undefined;
  if (!seal.collectorId || (collectorId && seal.collectorId !== collectorId)) return false;
  const { signature, ...unsigned } = seal;
  return crypto.verify(
    null,
    createHash("sha256").update(canonical(unsigned)).digest(),
    crypto.createPublicKey(key.publicKeyPem),
    Buffer.from(signature, "base64url"),
  );
};

export const verifyQuarterExecutionClosure = async (
  capsuleDir: string,
  requiredStages: readonly WorkKey["stageId"][],
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<void> => {
  await loadVerifiedQuarterExecution(capsuleDir, requiredStages, verificationKeys);
};

export type VerifiedStageSelection = Readonly<{
  stageId: WorkKey["stageId"];
  collectorId: string;
  targetSetSha256: string;
  selectedResultSetSha256: string;
  results: readonly Readonly<{
    key: WorkKey;
    state: "succeeded" | "observed-failure";
    resultSha256: string;
  }>[];
}>;

export type VerifiedQuarterExecution = Readonly<{
  capsuleConfigSha256: string;
  journalSha256: string;
  stages: readonly VerifiedStageSelection[];
}>;

const verifiedExecutionInstances = new WeakSet<object>();

export const assertVerifiedQuarterExecution = (value: VerifiedQuarterExecution): void => {
  if (!verifiedExecutionInstances.has(value)) {
    throw new Error("Execution selection was not issued by the closure verifier");
  }
};

export const loadVerifiedQuarterExecution = async (
  capsuleDir: string,
  requiredStages: readonly WorkKey["stageId"][],
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<VerifiedQuarterExecution> => {
  const executionDir = path.join(capsuleDir, "staging", "execution");
  const store = new ExecutionEventStore(path.join(executionDir, "events"));
  const events = await store.readAll();
  const rebuilt = rebuildExecution(events);
  const stages: VerifiedStageSelection[] = [];
  // RFC-0128: callers pass instrument ids from the instrument plan — expand
  // them to the seal stage ids that actually carry seals (profile →
  // homepage-capture + detected-page-capture).
  for (const stageId of requiredStages.flatMap((stage) => sealStagesFor(stage))) {
    const targetPath = path.join(capsuleDir, "staging", "targets", `${stageId}.json`);
    const target = JSON.parse(await fs.readFile(targetPath, "utf8")) as {
      schemaVersion: number;
      stageId: WorkKey["stageId"];
      targetSetSha256: string;
      targetCount: number;
      workKeyIds: string[];
    };
    const canonicalIds = [...new Set(target.workKeyIds)].sort();
    const targetHash = createHash("sha256").update(canonicalIds.join("\n")).digest("hex");
    if (
      target.schemaVersion !== 1 ||
      target.stageId !== stageId ||
      canonicalIds.length !== target.workKeyIds.length ||
      canonicalIds.join("\n") !== target.workKeyIds.join("\n") ||
      target.targetCount !== canonicalIds.length ||
      target.targetSetSha256 !== targetHash
    ) {
      throw new Error(`Stage ${stageId} frozen target artifact is invalid`);
    }
    const declarationEvents = events.filter(
      (event) => event.eventType === "target-declared" && event.stageId === stageId,
    );
    if (
      declarationEvents.length !== 1 ||
      declarationEvents[0]!.targetSetSha256 !== targetHash ||
      declarationEvents[0]!.targetCount !== canonicalIds.length
    ) {
      throw new Error(`Stage ${stageId} immutable target declaration is missing or inconsistent`);
    }
    const seal = JSON.parse(
      await fs.readFile(path.join(capsuleDir, "staging", "stage-seals", `${stageId}.json`), "utf8"),
    ) as SignedStageSeal;
    const key = verificationKeys.get(seal.signingKeyId);
    if (!key || !verifySignedStageSeal(seal, key))
      throw new Error(`Stage ${stageId} signed seal is invalid`);
    const selected = canonicalIds.map((id) => {
      const work = rebuilt.work.get(id);
      if (!work) throw new Error(`Stage ${stageId} target lacks execution evidence: ${id}`);
      if (work.key.stageId !== stageId)
        throw new Error(`Stage ${stageId} target contains a work key for ${work.key.stageId}`);
      const terminal = selectTerminalResult(work.attempts);
      if (!terminal) throw new Error(`Stage ${stageId} target is not terminal: ${id}`);
      const attempt = work.attempts.find((candidate) => candidate.ordinal === terminal.ordinal);
      if (!attempt?.resultSha256)
        throw new Error(`Stage ${stageId} target lacks immutable CAS evidence: ${id}`);
      return { id, state: terminal.state, sha256: attempt.resultSha256 };
    });
    for (const item of selected) {
      const work = rebuilt.work.get(item.id)!;
      const evidence = await readExecutionCasObject(capsuleDir, item.sha256);
      assertExecutionEvidenceMatchesWorkKey(evidence, work.key);
    }
    const succeeded = selected.filter((item) => item.state === "succeeded").length;
    const observedFailures = selected.filter((item) => item.state === "observed-failure").length;
    const selectedResultSetSha256 = createHash("sha256")
      .update(selected.map((item) => `${item.id}\0${item.state}\0${item.sha256}`).join("\n"))
      .digest("hex");
    const payload = seal.payload;
    if (
      payload.capsuleConfigSha256 !== rebuilt.capsuleConfigSha256 ||
      payload.stageId !== stageId ||
      payload.targetSetSha256 !== targetHash ||
      payload.targetCount !== canonicalIds.length ||
      payload.selectedResultSetSha256 !== selectedResultSetSha256 ||
      payload.succeeded !== succeeded ||
      payload.observedFailures !== observedFailures
    ) {
      throw new Error(`Stage ${stageId} signed completeness payload is inconsistent`);
    }
    const stageEvents = events.filter(
      (event) => event.eventType === "stage-sealed" && event.stageId === stageId,
    );
    if (
      stageEvents.length !== 1 ||
      stageEvents[0]!.targetSetSha256 !== targetHash ||
      stageEvents[0]!.selectedResultSetSha256 !== selectedResultSetSha256
    ) {
      throw new Error(`Stage ${stageId} immutable seal event is missing or inconsistent`);
    }
    stages.push(
      Object.freeze({
        stageId,
        collectorId: seal.collectorId,
        targetSetSha256: targetHash,
        selectedResultSetSha256,
        results: Object.freeze(
          selected.map((item) =>
            Object.freeze({
              key: Object.freeze({ ...rebuilt.work.get(item.id)!.key }),
              state: item.state,
              resultSha256: item.sha256,
            }),
          ),
        ),
      }),
    );
  }
  const verified = Object.freeze({
    capsuleConfigSha256: rebuilt.capsuleConfigSha256,
    journalSha256: rebuilt.journalSha256,
    stages: Object.freeze(stages),
  });
  verifiedExecutionInstances.add(verified);
  return verified;
};

/** Single-process coordinator backed by append-only evidence; reloads terminal work on resume. */
export class QuarterExecutionJournal {
  private readonly store: ExecutionEventStore;
  private readonly coordinationDir: string;
  private readonly stagingDir: string;
  private readonly terminalKeys = new Set<string>();
  private readonly terminalHashes = new Map<string, string>();
  private readonly terminalStates = new Map<string, "succeeded" | "observed-failure">();
  private initialized = false;

  constructor(
    eventsDir: string,
    readonly capsuleConfigSha256: string,
    private readonly signingKey?: SigningKeyConfig,
  ) {
    this.store = new ExecutionEventStore(eventsDir);
    const executionDir = path.dirname(eventsDir);
    this.coordinationDir = path.join(executionDir, "coordination");
    this.stagingDir =
      path.basename(executionDir) === "execution" ? path.dirname(executionDir) : executionDir;
  }

  async initialize(configuredEventId: string, now: string): Promise<void> {
    await fs.mkdir(this.coordinationDir, { recursive: true });
    const configurationPath = path.join(this.coordinationDir, "configuration.json");
    const proposedConfiguration: ExecutionEvent = {
      eventId: configuredEventId,
      eventAt: now,
      eventType: "capsule-configured",
      capsuleConfigSha256: this.capsuleConfigSha256,
    };
    const configurationTemp = `${configurationPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(configurationTemp, `${canonical(proposedConfiguration)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await fs.link(configurationTemp, configurationPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      await fs.unlink(configurationTemp).catch(() => undefined);
    }
    const configured = JSON.parse(await fs.readFile(configurationPath, "utf8")) as ExecutionEvent;
    if (configured.capsuleConfigSha256 !== this.capsuleConfigSha256) {
      throw new Error("Capsule configuration changed after execution began");
    }
    await this.store.append(configured);
    const existing = await this.store.readAll();
    if (existing.some((event) => event.capsuleConfigSha256 !== this.capsuleConfigSha256)) {
      throw new Error("Capsule configuration changed after execution began");
    }
    const rebuilt = await this.store.rebuild();
    for (const [id, work] of rebuilt.work) {
      const attempts = work.attempts.map((attempt) => ({
        ordinal: attempt.ordinal,
        state: attempt.state,
        ...(attempt.resultSha256 ? { resultSha256: attempt.resultSha256 } : {}),
      }));
      const terminal = selectTerminalResult(attempts);
      if (terminal) {
        this.terminalKeys.add(id);
        const selected = work.attempts.find((attempt) => attempt.ordinal === terminal.ordinal);
        if (selected?.resultSha256) this.terminalHashes.set(id, selected.resultSha256);
        this.terminalStates.set(id, terminal.state);
        if (selected?.resultSha256) {
          await this.writeTerminalMarker(id, terminal.state, selected.resultSha256);
        }
      }
      await this.ensureOrdinalCounter(
        id,
        Math.max(0, ...attempts.map((attempt) => attempt.ordinal)),
      );
    }
    this.initialized = true;
  }

  isTerminal(key: WorkKey): boolean {
    if (!this.initialized) throw new Error("Execution journal is not initialized");
    return this.terminalKeys.has(workKeyId(key));
  }

  terminalResultSha256(key: WorkKey): string | null {
    if (!this.initialized) throw new Error("Execution journal is not initialized");
    return this.terminalHashes.get(workKeyId(key)) ?? null;
  }

  async declareStageTargets(
    input: Readonly<{
      stageId: WorkKey["stageId"];
      keys: readonly WorkKey[];
      eventId: string;
      now: string;
    }>,
  ): Promise<Readonly<{ targetSetSha256: string; targetCount: number }>> {
    if (!this.initialized) throw new Error("Execution journal is not initialized");
    if (input.keys.some((candidate) => candidate.stageId !== input.stageId)) {
      throw new Error(`Stage ${input.stageId} target set contains a work key for another stage`);
    }
    const ids = [...new Set(input.keys.map(workKeyId))].sort();
    if (ids.length !== input.keys.length)
      throw new Error(`Stage ${input.stageId} contains duplicate work keys`);
    const targetSetSha256 = createHash("sha256").update(ids.join("\n")).digest("hex");
    await this.writeFrozenTargetSet(input.stageId, ids, targetSetSha256);
    const existing = (await this.store.readAll()).find(
      (event) => event.eventType === "target-declared" && event.stageId === input.stageId,
    );
    if (existing) {
      if (existing.targetSetSha256 !== targetSetSha256 || existing.targetCount !== ids.length) {
        throw new Error(`Stage ${input.stageId} target set changed after execution began`);
      }
      return { targetSetSha256, targetCount: ids.length };
    }
    await this.store.append({
      eventId: input.eventId,
      eventAt: input.now,
      eventType: "target-declared",
      capsuleConfigSha256: this.capsuleConfigSha256,
      stageId: input.stageId,
      targetSetSha256,
      targetCount: ids.length,
    });
    return { targetSetSha256, targetCount: ids.length };
  }

  private async writeFrozenTargetSet(
    stageId: WorkKey["stageId"],
    ids: readonly string[],
    targetSetSha256: string,
  ): Promise<void> {
    const target = path.join(this.stagingDir, "targets", `${stageId}.json`);
    const bytes = `${canonical({ schemaVersion: 1, stageId, targetSetSha256, targetCount: ids.length, workKeyIds: ids })}\n`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      const handle = await fs.open(target, "wx");
      try {
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await fs.readFile(target, "utf8")) !== bytes)
        throw new Error(`Stage ${stageId} target set changed after execution began`, {
          cause: error,
        });
    }
  }

  async begin(
    input: Readonly<{
      key: WorkKey;
      attemptId: string;
      leaseOwner: string;
      now: string;
      leaseExpiresAt: string;
    }>,
  ): Promise<StartedAttempt | null> {
    if (this.isTerminal(input.key)) return null;
    const id = workKeyId(input.key);
    if (await this.hasTerminalMarker(id)) return null;
    const leasePath = path.join(this.coordinationDir, "leases", `${coordinationFileId(id)}.json`);
    if (!(await this.acquireLease(leasePath, workKeyId(input.key), input))) return null;
    if (await this.hasTerminalMarker(id)) {
      await this.releaseLease(leasePath, input.attemptId);
      return null;
    }
    const ordinal = await this.claimNextOrdinal(id);
    try {
      await this.store.append({
        eventId: input.attemptId,
        eventAt: input.now,
        eventType: "attempt-state",
        capsuleConfigSha256: this.capsuleConfigSha256,
        key: input.key,
        attemptId: input.attemptId,
        ordinal,
        state: "leased",
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
      });
    } catch (error) {
      await this.releaseLease(leasePath, input.attemptId);
      throw error;
    }
    return { key: input.key, attemptId: input.attemptId, ordinal };
  }

  async finish(
    attempt: StartedAttempt,
    input: Readonly<{
      eventId: string;
      now: string;
      state: "succeeded" | "observed-failure" | "retryable" | "quarantined";
      resultSha256?: string;
      errorClass?: string;
    }>,
  ): Promise<void> {
    if (
      (input.state === "succeeded" || input.state === "observed-failure") &&
      !input.resultSha256
    ) {
      throw new Error(`Terminal attempt ${attempt.attemptId} requires immutable CAS evidence`);
    }
    const leasePath = path.join(
      this.coordinationDir,
      "leases",
      `${coordinationFileId(workKeyId(attempt.key))}.json`,
    );
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8")) as { attemptId: string };
    if (lease.attemptId !== attempt.attemptId)
      throw new Error(`Attempt ${attempt.attemptId} lost its execution lease`);
    await this.store.append({
      eventId: input.eventId,
      eventAt: input.now,
      eventType: "attempt-state",
      capsuleConfigSha256: this.capsuleConfigSha256,
      key: attempt.key,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
      state: input.state,
      ...(input.resultSha256 ? { resultSha256: input.resultSha256 } : {}),
      ...(input.errorClass ? { errorClass: input.errorClass } : {}),
    });
    if (input.state === "succeeded" || input.state === "observed-failure") {
      const id = workKeyId(attempt.key);
      this.terminalKeys.add(id);
      if (input.resultSha256) this.terminalHashes.set(id, input.resultSha256);
      this.terminalStates.set(id, input.state);
      await this.writeTerminalMarker(id, input.state, input.resultSha256!);
    }
    await this.releaseLease(leasePath, attempt.attemptId);
  }

  async heartbeat(
    attempt: StartedAttempt,
    input: Readonly<{ now: string; leaseExpiresAt: string }>,
  ): Promise<void> {
    const id = workKeyId(attempt.key);
    const fileId = coordinationFileId(id);
    const leasePath = path.join(this.coordinationDir, "leases", `${fileId}.json`);
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8")) as { attemptId: string };
    if (lease.attemptId !== attempt.attemptId)
      throw new Error(`Attempt ${attempt.attemptId} lost its execution lease`);
    if (Date.parse(input.leaseExpiresAt) <= Date.parse(input.now))
      throw new Error("Heartbeat expiry must be after heartbeat time");
    const heartbeatDir = path.join(this.coordinationDir, "heartbeats", fileId);
    await fs.mkdir(heartbeatDir, { recursive: true });
    const heartbeatPath = path.join(
      heartbeatDir,
      `${input.now.replaceAll(":", "-")}-${attempt.attemptId}.json`,
    );
    const bytes = `${canonical({ attemptId: attempt.attemptId, heartbeatAt: input.now, leaseExpiresAt: input.leaseExpiresAt })}\n`;
    const handle = await fs.open(heartbeatPath, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const confirmed = JSON.parse(await fs.readFile(leasePath, "utf8")) as { attemptId: string };
    if (confirmed.attemptId !== attempt.attemptId)
      throw new Error(`Attempt ${attempt.attemptId} lost its execution lease`);
  }

  private async acquireLease(
    leasePath: string,
    id: string,
    input: Readonly<{ attemptId: string; leaseOwner: string; now: string; leaseExpiresAt: string }>,
  ): Promise<boolean> {
    await fs.mkdir(path.dirname(leasePath), { recursive: true });
    const bytes = `${canonical({
      attemptId: input.attemptId,
      leaseOwner: input.leaseOwner,
      acquiredAt: input.now,
      leaseExpiresAt: input.leaseExpiresAt,
    })}\n`;
    for (;;) {
      const temp = `${leasePath}.${process.pid}.${randomUUID()}.tmp`;
      const handle = await fs.open(temp, "wx");
      try {
        try {
          await handle.writeFile(bytes, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.link(temp, leasePath);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      } finally {
        await handle.close().catch(() => undefined);
        await fs.unlink(temp).catch(() => undefined);
      }
      let active: { attemptId: string; leaseExpiresAt: string };
      try {
        active = JSON.parse(await fs.readFile(leasePath, "utf8")) as {
          attemptId: string;
          leaseExpiresAt: string;
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const heartbeatExpiry = await this.latestHeartbeatExpiry(id, active.attemptId);
      const effectiveExpiry = Math.max(Date.parse(active.leaseExpiresAt), heartbeatExpiry);
      if (effectiveExpiry > Date.parse(input.now)) return false;
      const expiredPath = `${leasePath}.expired-${input.attemptId}`;
      try {
        await fs.rename(leasePath, expiredPath);
        const renewedExpiry = await this.latestHeartbeatExpiry(id, active.attemptId);
        if (renewedExpiry > Date.parse(input.now)) {
          try {
            await fs.link(expiredPath, leasePath);
          } catch (restoreError) {
            if ((restoreError as NodeJS.ErrnoException).code !== "EEXIST") throw restoreError;
          }
          await fs.unlink(expiredPath).catch(() => undefined);
          return false;
        }
        await fs.unlink(expiredPath).catch(() => undefined);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  private async latestHeartbeatExpiry(id: string, attemptId: string): Promise<number> {
    const heartbeatDir = path.join(this.coordinationDir, "heartbeats", coordinationFileId(id));
    let names: string[];
    try {
      names = await fs.readdir(heartbeatDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return Number.NEGATIVE_INFINITY;
      throw error;
    }
    let latest = Number.NEGATIVE_INFINITY;
    for (const name of names.filter((candidate) => candidate.endsWith(`-${attemptId}.json`))) {
      const heartbeat = JSON.parse(await fs.readFile(path.join(heartbeatDir, name), "utf8")) as {
        attemptId: string;
        leaseExpiresAt: string;
      };
      if (heartbeat.attemptId === attemptId)
        latest = Math.max(latest, Date.parse(heartbeat.leaseExpiresAt));
    }
    return latest;
  }

  private async releaseLease(leasePath: string, attemptId: string): Promise<void> {
    try {
      const lease = JSON.parse(await fs.readFile(leasePath, "utf8")) as { attemptId: string };
      if (lease.attemptId === attemptId) await fs.unlink(leasePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async hasTerminalMarker(id: string): Promise<boolean> {
    try {
      await fs.access(
        path.join(this.coordinationDir, "terminal", `${coordinationFileId(id)}.json`),
      );
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async writeTerminalMarker(
    id: string,
    state: "succeeded" | "observed-failure",
    resultSha256: string,
  ): Promise<void> {
    const markerPath = path.join(
      this.coordinationDir,
      "terminal",
      `${coordinationFileId(id)}.json`,
    );
    const bytes = `${canonical({ state, resultSha256 })}\n`;
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    try {
      const handle = await fs.open(markerPath, "wx");
      try {
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await fs.readFile(markerPath, "utf8")) !== bytes) {
        throw new Error(`Terminal marker conflicts for WorkKey ${id}`, { cause: error });
      }
    }
  }

  private async ensureOrdinalCounter(id: string, minimum: number): Promise<void> {
    const counterPath = path.join(
      this.coordinationDir,
      "ordinals",
      `${coordinationFileId(id)}.txt`,
    );
    await fs.mkdir(path.dirname(counterPath), { recursive: true });
    try {
      const current = Number.parseInt(await fs.readFile(counterPath, "utf8"), 10);
      if (Number.isSafeInteger(current) && current >= minimum) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temp = `${counterPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, `${minimum}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temp, counterPath);
  }

  private async claimNextOrdinal(id: string): Promise<number> {
    const counterPath = path.join(
      this.coordinationDir,
      "ordinals",
      `${coordinationFileId(id)}.txt`,
    );
    let current = 0;
    try {
      current = Number.parseInt(await fs.readFile(counterPath, "utf8"), 10);
      if (!Number.isSafeInteger(current) || current < 0)
        throw new Error(`Invalid attempt ordinal counter for WorkKey ${id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const next = current + 1;
    const temp = `${counterPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(counterPath), { recursive: true });
    await fs.writeFile(temp, `${next}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temp, counterPath);
    return next;
  }

  async sealStage(
    input: Readonly<{
      stageId: WorkKey["stageId"];
      keys: readonly WorkKey[];
      eventId: string;
      now: string;
      // RFC-0128: the stage's declared capsule output artifacts, snapshotted
      // into the capsule dir by the caller before sealing.
      outputArtifacts: readonly CapsuleArtifact[];
    }>,
  ): Promise<
    Readonly<{
      targetSetSha256: string;
      selectedResultSetSha256: string;
      succeeded: number;
      observedFailures: number;
    }>
  > {
    if (input.keys.some((candidate) => candidate.stageId !== input.stageId)) {
      throw new Error(`Stage ${input.stageId} seal contains a work key for another stage`);
    }
    const ids = [...new Set(input.keys.map(workKeyId))].sort();
    if (ids.length !== input.keys.length)
      throw new Error(`Stage ${input.stageId} contains duplicate work keys`);
    const targetSetSha256 = createHash("sha256").update(ids.join("\n")).digest("hex");
    const declaration = (await this.store.readAll()).find(
      (event) => event.eventType === "target-declared" && event.stageId === input.stageId,
    );
    if (!declaration)
      throw new Error(`Stage ${input.stageId} target set was not declared before execution`);
    if (declaration.targetSetSha256 !== targetSetSha256 || declaration.targetCount !== ids.length) {
      throw new Error(`Stage ${input.stageId} target set differs from its frozen declaration`);
    }
    const selected = ids.map((id) => ({
      id,
      state: this.terminalStates.get(id),
      sha256: this.terminalHashes.get(id),
    }));
    const succeeded = selected.filter((item) => item.state === "succeeded").length;
    const observedFailures = selected.filter((item) => item.state === "observed-failure").length;
    assertStageComplete({
      targetCount: ids.length,
      succeeded,
      observedFailures,
      approvedExclusions: 0,
      quarantined: 0,
    });
    if (selected.some((item) => !item.sha256))
      throw new Error(`Stage ${input.stageId} has terminal work without CAS evidence`);
    const selectedResultSetSha256 = createHash("sha256")
      .update(selected.map((item) => `${item.id}\0${item.state}\0${item.sha256}`).join("\n"))
      .digest("hex");
    const stageSealPayload: SignedStageSeal["payload"] = {
      capsuleConfigSha256: this.capsuleConfigSha256,
      stageId: input.stageId,
      targetSetSha256,
      targetCount: ids.length,
      selectedResultSetSha256,
      succeeded,
      observedFailures,
    };
    const existing = (await this.store.readAll()).find(
      (event) => event.eventType === "stage-sealed" && event.stageId === input.stageId,
    );
    if (existing) {
      if (
        existing.targetSetSha256 !== targetSetSha256 ||
        existing.selectedResultSetSha256 !== selectedResultSetSha256
      ) {
        throw new Error(`Stage ${input.stageId} seal conflicts with immutable prior seal`);
      }
      await this.writeSignedStageSeal(stageSealPayload);
    } else {
      await this.writeSignedStageSeal(stageSealPayload);
      await this.store.append({
        eventId: input.eventId,
        eventAt: input.now,
        eventType: "stage-sealed",
        capsuleConfigSha256: this.capsuleConfigSha256,
        stageId: input.stageId,
        targetSetSha256,
        targetCount: ids.length,
        selectedResultSetSha256,
        succeeded,
        observedFailures,
        approvedExclusions: 0,
        quarantined: 0,
      });
    }
    // RFC-0128: the staging manifest is a contemporaneous seal record — append
    // this stage's admission entries (seal + target-set + declared outputs) on
    // every seal, including idempotent retries after a mid-append crash.
    const capsuleDir = path.dirname(this.stagingDir);
    const sealPath = path.join(this.stagingDir, "stage-seals", `${input.stageId}.json`);
    const targetPath = path.join(this.stagingDir, "targets", `${input.stageId}.json`);
    const [sealStat, targetStat, sealSha256, targetSha256] = await Promise.all([
      fs.stat(sealPath),
      fs.stat(targetPath),
      sha256File(sealPath),
      sha256File(targetPath),
    ]);
    await appendCapsuleSealArtifacts(capsuleDir, input.stageId, [
      {
        stage: "qc",
        uri: `staging/stage-seals/${input.stageId}.json`,
        sha256: sealSha256,
        bytes: sealStat.size,
      },
      {
        stage: "qc",
        uri: `staging/targets/${input.stageId}.json`,
        sha256: targetSha256,
        bytes: targetStat.size,
      },
      ...input.outputArtifacts,
    ]);
    return { targetSetSha256, selectedResultSetSha256, succeeded, observedFailures };
  }

  private async writeSignedStageSeal(payload: SignedStageSeal["payload"]): Promise<void> {
    const signingKey = this.signingKey ?? loadSigningKeyFromEnv();
    const unsigned = {
      schemaVersion: 1 as const,
      payload,
      signedAt: new Date().toISOString(),
      signingKeyId: signingKey.signingKeyId,
      collectorId: signingKey.collectorId,
    };
    const digest = createHash("sha256").update(canonical(unsigned)).digest();
    const seal: SignedStageSeal = {
      ...unsigned,
      signature: crypto
        .sign(null, digest, crypto.createPrivateKey(signingKey.privateKeyPem))
        .toString("base64url"),
    };
    const sealDir = path.join(this.stagingDir, "stage-seals");
    const target = path.join(sealDir, `${payload.stageId}.json`);
    await fs.mkdir(sealDir, { recursive: true });
    const bytes = `${canonical(seal)}\n`;
    try {
      const handle = await fs.open(target, "wx");
      try {
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(await fs.readFile(target, "utf8")) as SignedStageSeal;
      if (canonical(existing.payload) !== canonical(payload))
        throw new Error(`Stage ${payload.stageId} signed seal conflicts`, { cause: error });
      const key =
        existing.signingKeyId === signingKey.signingKeyId
          ? signingKey
          : (await loadVerificationKeys(getTransparencyKeysDir())).get(existing.signingKeyId);
      if (!key || !verifySignedStageSeal(existing, key)) {
        throw new Error(`Stage ${payload.stageId} signed seal is invalid`, { cause: error });
      }
    }
  }
}

// ─── Durable Execution Authority (RFC-0114) ──────────────────────────────

export type MeasurementEvidence = Readonly<{
  schema: "hdri-measurement@1";
  workKey: string;
  attemptId: string;
  measuredAt: string | null;
  dependencyFingerprint: string;
  upstreamDigests: string[];
  outcome: "observed" | "unavailable" | "policy-excluded";
  contentRefs: string[];
}>;

export type OrderedExecutionEvent = Readonly<{
  sequence: number;
  previousEventSha256: string | null;
  eventSha256: string;
  leaseEpoch: number;
  attemptId: string;
  recordedAt: string;
  payload: unknown;
}>;

export type SignedJournalSegment = Readonly<{
  schema: "hdri-journal-segment@1";
  workKey: string;
  firstSequence: number;
  lastSequence: number;
  segmentSha256: string;
  eventCount: number;
  sealedAt: string;
}>;

const hashPayload = (payload: unknown): string =>
  createHash("sha256").update(canonical(payload)).digest("hex");

const withBusyRetry = <T>(fn: () => T): T => {
  const maxRetries = 5;
  const baseDelayMs = 50;
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("SQLITE_BUSY")) throw error;
      const delayMs = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      const start = Date.now();
      while (Date.now() - start < delayMs + jitter) {
        // synchronous busy-wait for SQLite retry
      }
    }
  }
};

const DURABLE_INIT_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;

  CREATE TABLE IF NOT EXISTS ordered_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    previous_event_sha256 TEXT,
    event_sha256 TEXT NOT NULL,
    lease_epoch INTEGER NOT NULL,
    attempt_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    work_key_id TEXT,
    payload TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ordered_events_work_key
    ON ordered_events(work_key_id);

  CREATE TABLE IF NOT EXISTS measurement_evidence (
    work_key_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    measured_at TEXT,
    dependency_fingerprint TEXT NOT NULL,
    upstream_digests TEXT NOT NULL,
    outcome TEXT NOT NULL,
    content_refs TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    PRIMARY KEY (work_key_id, attempt_id)
  );

  CREATE TABLE IF NOT EXISTS lease_epochs (
    work_key_id TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    attempt_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (work_key_id, epoch)
  );

  CREATE TABLE IF NOT EXISTS journal_segments (
    work_key_id TEXT NOT NULL,
    first_sequence INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL,
    segment_sha256 TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    sealed_at TEXT NOT NULL,
    PRIMARY KEY (work_key_id, first_sequence)
  );

  CREATE TABLE IF NOT EXISTS stage_targets (
    stage_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    work_key_id TEXT NOT NULL,
    target_set_sha256 TEXT NOT NULL,
    declared_at TEXT NOT NULL,
    PRIMARY KEY (stage_id, work_key_id)
  );

  CREATE TABLE IF NOT EXISTS sealed_projections (
    work_key_id TEXT PRIMARY KEY,
    stage_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    expected_work_set_sha256 TEXT NOT NULL,
    terminal_work_set_sha256 TEXT NOT NULL,
    selected_result_set_sha256 TEXT NOT NULL,
    projection_sha256 TEXT NOT NULL,
    snapshot_uri TEXT NOT NULL,
    snapshot_sha256 TEXT NOT NULL,
    snapshot_bytes INTEGER NOT NULL,
    sealed_at TEXT NOT NULL
  );
`;

export const createExecutionDb = (dbPath: string): DatabaseType => {
  const db = new Database(dbPath);
  db.exec(DURABLE_INIT_SQL);
  return db;
};

export const executionDbPath = (capsuleDir: string): string =>
  path.join(capsuleDir, "staging", "execution", "sequence.db");

export const openExecutionDb = (capsuleDir: string): DatabaseType => {
  const dbPath = executionDbPath(capsuleDir);
  return createExecutionDb(dbPath);
};

export const appendOrderedEvent = (
  db: DatabaseType,
  input: Readonly<{
    attemptId: string;
    recordedAt: string;
    leaseEpoch: number;
    workKeyId?: string;
    payload: unknown;
  }>,
): OrderedExecutionEvent => {
  return withBusyRetry(() => {
    const lastRow = db
      .prepare("SELECT sequence, event_sha256 FROM ordered_events ORDER BY sequence DESC LIMIT 1")
      .get() as { sequence: number; event_sha256: string } | undefined;

    const sequence = (lastRow?.sequence ?? 0) + 1;
    const previousEventSha256 = lastRow?.event_sha256 ?? null;
    const eventSha256 = hashPayload({
      sequence,
      previousEventSha256,
      leaseEpoch: input.leaseEpoch,
      attemptId: input.attemptId,
      recordedAt: input.recordedAt,
      payload: input.payload,
    });

    db.prepare(
      `INSERT INTO ordered_events
        (sequence, previous_event_sha256, event_sha256, lease_epoch, attempt_id, recorded_at, work_key_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sequence,
      previousEventSha256,
      eventSha256,
      input.leaseEpoch,
      input.attemptId,
      input.recordedAt,
      input.workKeyId ?? null,
      canonical(input.payload),
    );

    return {
      sequence,
      previousEventSha256,
      eventSha256,
      leaseEpoch: input.leaseEpoch,
      attemptId: input.attemptId,
      recordedAt: input.recordedAt,
      payload: input.payload,
    };
  });
};

export const readOrderedEvents = (
  db: DatabaseType,
  workKeyId?: string,
): OrderedExecutionEvent[] => {
  type EventRow = {
    sequence: number;
    previous_event_sha256: string | null;
    event_sha256: string;
    lease_epoch: number;
    attempt_id: string;
    recorded_at: string;
    payload: string;
  };
  const rows: EventRow[] = workKeyId
    ? (db
        .prepare("SELECT * FROM ordered_events WHERE work_key_id = ? ORDER BY sequence ASC")
        .all(workKeyId) as EventRow[])
    : (db.prepare("SELECT * FROM ordered_events ORDER BY sequence ASC").all() as EventRow[]);

  return rows.map((row) => ({
    sequence: row.sequence,
    previousEventSha256: row.previous_event_sha256,
    eventSha256: row.event_sha256,
    leaseEpoch: row.lease_epoch,
    attemptId: row.attempt_id,
    recordedAt: row.recorded_at,
    payload: JSON.parse(row.payload),
  }));
};

export const allocateLeaseEpoch = (
  db: DatabaseType,
  workKeyId: string,
  attemptId: string,
  now: string,
): number => {
  return withBusyRetry(() => {
    const lastEpoch = db
      .prepare("SELECT MAX(epoch) as max_epoch FROM lease_epochs WHERE work_key_id = ?")
      .get(workKeyId) as { max_epoch: number | null } | undefined;

    const epoch = (lastEpoch?.max_epoch ?? 0) + 1;

    db.prepare(
      `INSERT INTO lease_epochs (work_key_id, epoch, attempt_id, acquired_at, active)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(workKeyId, epoch, attemptId, now);

    return epoch;
  });
};

export const verifyLeaseEpoch = (
  db: DatabaseType,
  workKeyId: string,
  attemptId: string,
  epoch: number,
): boolean => {
  const current = db
    .prepare(
      "SELECT epoch, attempt_id, active FROM lease_epochs WHERE work_key_id = ? ORDER BY epoch DESC LIMIT 1",
    )
    .get(workKeyId) as { epoch: number; attempt_id: string; active: number } | undefined;

  if (!current || !current.active) return false;
  if (current.epoch !== epoch) return false;
  if (current.attempt_id !== attemptId) return false;
  return true;
};

export const releaseLeaseEpoch = (db: DatabaseType, workKeyId: string, epoch: number): void => {
  db.prepare("UPDATE lease_epochs SET active = 0 WHERE work_key_id = ? AND epoch = ?").run(
    workKeyId,
    epoch,
  );
};

// @ai-invariant: An accepted attempt is immutable; retries may only repeat identical evidence.
export const writeMeasurementEvidence = (db: DatabaseType, evidence: MeasurementEvidence): void => {
  db.transaction(() => {
    const existing = readMeasurementEvidence(db, evidence.workKey, evidence.attemptId);
    if (existing) {
      if (canonical(existing) !== canonical(evidence)) {
        throw new Error(`MEASUREMENT_CONFLICT: ${evidence.workKey}/${evidence.attemptId}`);
      }
      return;
    }
    db.prepare(
      `INSERT INTO measurement_evidence
      (work_key_id, attempt_id, measured_at, dependency_fingerprint, upstream_digests, outcome, content_refs, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      evidence.workKey,
      evidence.attemptId,
      evidence.measuredAt,
      evidence.dependencyFingerprint,
      JSON.stringify(evidence.upstreamDigests),
      evidence.outcome,
      evidence.contentRefs === undefined ? null : JSON.stringify(evidence.contentRefs),
      new Date().toISOString(),
    );
  }).immediate();
  stageProjectionCaches.get(db)?.clear();
};

export const readMeasurementEvidence = (
  db: DatabaseType,
  workKeyId: string,
  attemptId: string,
): MeasurementEvidence | null => {
  type EvidenceRow = {
    work_key_id: string;
    attempt_id: string;
    measured_at: string | null;
    dependency_fingerprint: string;
    upstream_digests: string;
    outcome: string;
    content_refs: string;
    committed_at: string;
  };
  const row = db
    .prepare("SELECT * FROM measurement_evidence WHERE work_key_id = ? AND attempt_id = ?")
    .get(workKeyId, attemptId) as EvidenceRow | undefined;

  if (!row) return null;

  return {
    schema: "hdri-measurement@1",
    workKey: row.work_key_id,
    attemptId: row.attempt_id,
    measuredAt: row.measured_at,
    dependencyFingerprint: row.dependency_fingerprint,
    upstreamDigests: JSON.parse(row.upstream_digests) as string[],
    outcome: row.outcome as MeasurementEvidence["outcome"],
    contentRefs: JSON.parse(row.content_refs) as string[],
  };
};

export const compactJournalSegment = (
  db: DatabaseType,
  workKeyId: string,
): SignedJournalSegment => {
  const events = readOrderedEvents(db, workKeyId);
  if (events.length === 0) {
    throw new Error(`No events to compact for work key ${workKeyId}`);
  }

  const firstSequence = events[0]!.sequence;
  const lastSequence = events[events.length - 1]!.sequence;
  const segmentSha256 = createHash("sha256")
    .update(events.map((e) => e.eventSha256).join("\n"))
    .digest("hex");

  const sealedAt = new Date().toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO journal_segments
      (work_key_id, first_sequence, last_sequence, segment_sha256, event_count, sealed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(workKeyId, firstSequence, lastSequence, segmentSha256, events.length, sealedAt);

  return {
    schema: "hdri-journal-segment@1",
    workKey: workKeyId,
    firstSequence,
    lastSequence,
    segmentSha256,
    eventCount: events.length,
    sealedAt,
  };
};

export const readJournalSegment = (
  db: DatabaseType,
  workKeyId: string,
): SignedJournalSegment | null => {
  type SegmentRow = {
    work_key_id: string;
    first_sequence: number;
    last_sequence: number;
    segment_sha256: string;
    event_count: number;
    sealed_at: string;
  };
  const row = db
    .prepare(
      "SELECT * FROM journal_segments WHERE work_key_id = ? ORDER BY first_sequence DESC LIMIT 1",
    )
    .get(workKeyId) as SegmentRow | undefined;

  if (!row) return null;

  return {
    schema: "hdri-journal-segment@1",
    workKey: row.work_key_id,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    segmentSha256: row.segment_sha256,
    eventCount: row.event_count,
    sealedAt: row.sealed_at,
  };
};

export const measurementEvidenceForWorkKey = (
  key: WorkKey,
  attemptId: string,
  input: Readonly<{
    measuredAt: string | null;
    dependencyFingerprint: string;
    upstreamDigests: string[];
    outcome: MeasurementEvidence["outcome"];
    contentRefs: string[];
  }>,
): MeasurementEvidence => ({
  schema: "hdri-measurement@1",
  workKey: canonicalResumeKey([
    key.period,
    key.capsuleId,
    key.stageId,
    key.provisionalAssetId,
    key.instrumentVersion,
  ]),
  attemptId,
  measuredAt: input.measuredAt,
  dependencyFingerprint: input.dependencyFingerprint,
  upstreamDigests: input.upstreamDigests,
  outcome: input.outcome,
  contentRefs: input.contentRefs,
});

// ─── Stage target declaration (RFC-0114) ──────────────────────────────────

export const declareStageTargetSet = (
  db: DatabaseType,
  input: Readonly<{
    stageId: string;
    deviceId: string;
    workKeyIds: readonly string[];
    now: string;
  }>,
): string => {
  const ids = [...new Set(input.workKeyIds)].sort();
  if (ids.length !== input.workKeyIds.length) {
    throw new Error(`Stage ${input.stageId} contains duplicate work keys`);
  }
  const targetSetSha256 = createHash("sha256").update(ids.join("\n")).digest("hex");

  db.transaction(() => {
    const existing = db
      .prepare("SELECT DISTINCT target_set_sha256 FROM stage_targets WHERE stage_id = ?")
      .get(input.stageId) as { target_set_sha256: string } | undefined;
    if (existing && existing.target_set_sha256 !== targetSetSha256) {
      throw new Error(`Stage ${input.stageId} target set changed after execution began`);
    }
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO stage_targets (stage_id, device_id, work_key_id, target_set_sha256, declared_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const id of ids) {
      stmt.run(input.stageId, input.deviceId, id, targetSetSha256, input.now);
    }
  }).immediate();
  stageProjectionCaches.get(db)?.clear();

  return targetSetSha256;
};

// ─── Sealed projection (RFC-0114) ─────────────────────────────────────────

export const sealedProjection = (db: DatabaseType, workKeyId: string): SealedProjection | null => {
  type ProjectionRow = {
    work_key_id: string;
    stage_id: string;
    device_id: string;
    expected_work_set_sha256: string;
    terminal_work_set_sha256: string;
    selected_result_set_sha256: string;
    projection_sha256: string;
    snapshot_uri: string;
    snapshot_sha256: string;
    snapshot_bytes: number;
    sealed_at: string;
  };
  const row = db
    .prepare("SELECT * FROM sealed_projections WHERE work_key_id = ?")
    .get(workKeyId) as ProjectionRow | undefined;

  if (!row) return null;

  return {
    stageId: row.stage_id,
    deviceId: row.device_id,
    expectedWorkSetSha256: row.expected_work_set_sha256,
    terminalWorkSetSha256: row.terminal_work_set_sha256,
    selectedResultSetSha256: row.selected_result_set_sha256,
    projectionSha256: row.projection_sha256,
    snapshotRef: {
      uri: row.snapshot_uri,
      sha256: row.snapshot_sha256,
      bytes: row.snapshot_bytes,
    },
  };
};

// ─── Transactional commit (RFC-0114) ──────────────────────────────────────
// @ai-invariant: lease verification, evidence persistence, projection write, and lease release are atomic

// Per-stage projection cache. commitAttempt recomputes stage-level digests on
// every call; the expected work set is frozen after declareStageTargetSet and
// measurement_evidence only grows through this module, so both are safe to
// memoize per (db, stageId) for the life of the process. Without this cache
// each commit issues one point query per expected key (O(targets²) per stage).
type ProjectionTuple = {
  workKeyId: string;
  attemptId: string;
  outcome: string;
  measuredAt: string | null;
  inputFingerprint: string;
  evidenceRefs: string[];
};

type StageProjectionCache = {
  expectedWorkKeys: string[];
  terminalIds: Set<string>;
  tuples: ProjectionTuple[];
  fragments: string[];
};

const stageProjectionCaches = new WeakMap<DatabaseType, Map<string, StageProjectionCache>>();

const projectionTupleCompare = (a: ProjectionTuple, b: ProjectionTuple): number =>
  a.workKeyId === b.workKeyId
    ? a.attemptId < b.attemptId
      ? -1
      : a.attemptId > b.attemptId
        ? 1
        : 0
    : a.workKeyId < b.workKeyId
      ? -1
      : 1;

const projectionInsertIndex = (
  tuples: readonly ProjectionTuple[],
  tuple: ProjectionTuple,
): number => {
  let lo = 0;
  let hi = tuples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (projectionTupleCompare(tuples[mid]!, tuple) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const loadStageProjectionCache = (db: DatabaseType, stageId: string): StageProjectionCache => {
  let byStage = stageProjectionCaches.get(db);
  if (!byStage) {
    byStage = new Map();
    stageProjectionCaches.set(db, byStage);
  }
  const cached = byStage.get(stageId);
  if (cached) return cached;

  const expectedWorkKeys = (
    db
      .prepare("SELECT work_key_id FROM stage_targets WHERE stage_id = ? ORDER BY work_key_id ASC")
      .all(stageId) as { work_key_id: string }[]
  ).map((row) => row.work_key_id);

  type EvidenceRow = {
    work_key_id: string;
    attempt_id: string;
    measured_at: string | null;
    dependency_fingerprint: string;
    outcome: string;
    content_refs: string;
  };
  const rows = db
    .prepare(
      `SELECT work_key_id, attempt_id, measured_at, dependency_fingerprint, outcome, content_refs
       FROM measurement_evidence
       WHERE work_key_id IN (SELECT work_key_id FROM stage_targets WHERE stage_id = ?)
       ORDER BY work_key_id ASC, attempt_id ASC`,
    )
    .all(stageId) as EvidenceRow[];

  const tuples: ProjectionTuple[] = rows.map((row) => ({
    workKeyId: row.work_key_id,
    attemptId: row.attempt_id,
    outcome: row.outcome,
    measuredAt: row.measured_at,
    inputFingerprint: row.dependency_fingerprint,
    evidenceRefs: JSON.parse(row.content_refs) as string[],
  }));
  const cache: StageProjectionCache = {
    expectedWorkKeys,
    terminalIds: new Set(tuples.map((tuple) => tuple.workKeyId)),
    tuples,
    fragments: tuples.map((tuple) => canonical(tuple)),
  };
  byStage.set(stageId, cache);
  return cache;
};

export const commitAttempt = (db: DatabaseType, input: CommitAttemptInput): SealedProjection => {
  const deferred: { applyCacheUpdate: (() => void) | null } = { applyCacheUpdate: null };
  const projection = withBusyRetry(() => {
    deferred.applyCacheUpdate = null;
    return db
      .transaction(() => {
        // 1. Verify lease epoch
        if (!verifyLeaseEpoch(db, input.workKeyId, input.attemptId, input.epoch)) {
          throw new Error(
            `LEASE_EPOCH_MISMATCH: ${input.workKeyId}/${input.attemptId} epoch=${input.epoch}`,
          );
        }

        // 2. Look up stageId and deviceId from stage_targets
        type TargetRow = { stage_id: string; device_id: string; target_set_sha256: string };
        const target = db
          .prepare(
            "SELECT stage_id, device_id, target_set_sha256 FROM stage_targets WHERE work_key_id = ?",
          )
          .get(input.workKeyId) as TargetRow | undefined;

        if (!target) {
          throw new Error(`No stage target declared for work key ${input.workKeyId}`);
        }

        const stageId = target.stage_id;
        const deviceId = target.device_id;
        const expectedWorkSetSha256 = target.target_set_sha256;

        // 3. Persist measurement evidence
        const evidence: MeasurementEvidence = {
          schema: "hdri-measurement@1",
          workKey: input.workKeyId,
          attemptId: input.attemptId,
          measuredAt: input.measuredAt,
          dependencyFingerprint: input.inputFingerprint,
          upstreamDigests: input.evidence.map((e) => e.sha256),
          outcome:
            input.outcome === "succeeded"
              ? "observed"
              : input.outcome === "unavailable"
                ? "unavailable"
                : input.outcome === "excluded"
                  ? "policy-excluded"
                  : "observed",
          contentRefs: input.evidence.map((e) => e.sha256),
        };

        const existing = readMeasurementEvidence(db, input.workKeyId, input.attemptId);
        if (existing) {
          if (canonical(existing) !== canonical(evidence)) {
            throw new Error(`MEASUREMENT_CONFLICT: ${input.workKeyId}/${input.attemptId}`);
          }
        } else {
          db.prepare(
            `INSERT INTO measurement_evidence
          (work_key_id, attempt_id, measured_at, dependency_fingerprint, upstream_digests, outcome, content_refs, committed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            evidence.workKey,
            evidence.attemptId,
            evidence.measuredAt,
            evidence.dependencyFingerprint,
            JSON.stringify(evidence.upstreamDigests),
            evidence.outcome,
            JSON.stringify(evidence.contentRefs),
            new Date().toISOString(),
          );
        }

        // 4. Derive sealed projection digests
        // 4a. expectedWorkSetSha256 — from stage_targets (already have it)

        // 4b. terminalWorkSetSha256 — using typed set reconciliation (RFC-0114)
        // The expected set is frozen after declaration and measurement_evidence
        // only grows through this module, so both are served from the per-stage
        // in-memory cache instead of rescanning the tables on every commit.
        const cache = loadStageProjectionCache(db, stageId);
        const expectedWorkKeys = cache.expectedWorkKeys;
        const isNewEvidence = !existing;
        const terminalWorkKeys = expectedWorkKeys.filter(
          (id) => cache.terminalIds.has(id) || (isNewEvidence && id === input.workKeyId),
        );

        // Typed set reconciliation — validates no duplicates, computes disjoint partition
        const reconciliation = reconcileTerminalSet(expectedWorkKeys, terminalWorkKeys);

        const terminalWorkSetSha256 = createHash("sha256")
          .update(reconciliation.terminal.join("\n"))
          .digest("hex");

        // 4c. selectedResultSetSha256 — from sorted tuples
        const newTuple: ProjectionTuple = {
          workKeyId: input.workKeyId,
          attemptId: input.attemptId,
          outcome: evidence.outcome,
          measuredAt: evidence.measuredAt,
          inputFingerprint: evidence.dependencyFingerprint,
          evidenceRefs: evidence.contentRefs,
        };
        let fragments = cache.fragments;
        let insertIndex = -1;
        let newFragment = "";
        if (isNewEvidence) {
          newFragment = canonical(newTuple);
          insertIndex = projectionInsertIndex(cache.tuples, newTuple);
          fragments = [
            ...cache.fragments.slice(0, insertIndex),
            newFragment,
            ...cache.fragments.slice(insertIndex),
          ];
        }
        // canonical(array) is "[" + comma-joined canonical elements + "]", so
        // hashing the joined fragments is byte-identical to canonical(tuples).
        const selectedResultSetSha256 = createHash("sha256")
          .update(`[${fragments.join(",")}]`)
          .digest("hex");

        if (isNewEvidence) {
          const tuple = newTuple;
          const fragment = newFragment;
          const index = insertIndex;
          deferred.applyCacheUpdate = () => {
            cache.tuples.splice(index, 0, tuple);
            cache.fragments.splice(index, 0, fragment);
            cache.terminalIds.add(input.workKeyId);
          };
        }

        // 4d. projectionSha256 — from canonical consumed row values with keys
        const projectionInput = {
          stageId,
          deviceId,
          expectedWorkSetSha256,
          terminalWorkSetSha256,
          selectedResultSetSha256,
          workKeyId: input.workKeyId,
          attemptId: input.attemptId,
          epoch: input.epoch,
          outcome: input.outcome,
          measuredAt: input.measuredAt,
          inputFingerprint: input.inputFingerprint,
        };

        const projectionSha256 = createHash("sha256")
          .update(canonical(projectionInput))
          .digest("hex");

        // 5. Write sealed projection
        const snapshotUri = `cas://${input.evidence[0]?.sha256 ?? "empty"}`;
        const snapshotSha256 = input.evidence[0]?.sha256 ?? "";
        const snapshotBytes = input.evidence.reduce((sum, e) => sum + e.bytes, 0);

        db.prepare(
          `INSERT OR REPLACE INTO sealed_projections
          (work_key_id, stage_id, device_id, expected_work_set_sha256, terminal_work_set_sha256,
           selected_result_set_sha256, projection_sha256, snapshot_uri, snapshot_sha256, snapshot_bytes, sealed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.workKeyId,
          stageId,
          deviceId,
          expectedWorkSetSha256,
          terminalWorkSetSha256,
          selectedResultSetSha256,
          projectionSha256,
          snapshotUri,
          snapshotSha256,
          snapshotBytes,
          new Date().toISOString(),
        );

        // 6. Release lease
        releaseLeaseEpoch(db, input.workKeyId, input.epoch);

        // 7. Return the sealed projection
        return {
          stageId,
          deviceId,
          expectedWorkSetSha256,
          terminalWorkSetSha256,
          selectedResultSetSha256,
          projectionSha256,
          snapshotRef: {
            uri: snapshotUri,
            sha256: snapshotSha256,
            bytes: snapshotBytes,
          },
        } satisfies SealedProjection;
      })
      .immediate();
  });
  deferred.applyCacheUpdate?.();
  return projection;
};
