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
</CHANGE_SUMMARY>
*/
// @ai-invariant: terminal evidence is committed before its lease is released

import { createHash, randomUUID } from "node:crypto";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getTransparencyKeysDir,
  loadSigningKeyFromEnv,
  loadVerificationKeys,
  type SigningKeyConfig,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import { canonicalResumeKey, type WorkKey, type WorkState } from "./quarter-contracts.js";
import { assertStageComplete, selectTerminalResult } from "./execution-journal.js";

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

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
};

export const workKeyId = (key: WorkKey): string =>
  canonicalResumeKey([
    key.period,
    key.capsuleId,
    key.stageId,
    key.provisionalAssetId,
    key.instrumentVersion,
  ]);

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

export const quarterCapsuleDir = (
  factoryRootDir: string,
  deviceId: string,
  period: string,
  capsuleId: string,
): string =>
  path.join(
    factoryRootDir,
    "a-contract-ontology",
    ".output",
    deviceId,
    "capsules",
    period,
    capsuleId,
  );

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
  schemaVersion: 1;
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
  if (
    evidence.schemaVersion !== 1 ||
    evidence.stage !== key.stageId ||
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
  const executionDir = path.join(capsuleDir, "staging", "execution");
  const store = new ExecutionEventStore(path.join(executionDir, "events"));
  const rebuilt = await store.rebuild();
  const events = await store.readAll();
  for (const stageId of requiredStages) {
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
  }
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
    const leasePath = path.join(this.coordinationDir, "leases", `${id}.json`);
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
    const leasePath = path.join(this.coordinationDir, "leases", `${workKeyId(attempt.key)}.json`);
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
    const leasePath = path.join(this.coordinationDir, "leases", `${id}.json`);
    const lease = JSON.parse(await fs.readFile(leasePath, "utf8")) as { attemptId: string };
    if (lease.attemptId !== attempt.attemptId)
      throw new Error(`Attempt ${attempt.attemptId} lost its execution lease`);
    if (Date.parse(input.leaseExpiresAt) <= Date.parse(input.now))
      throw new Error("Heartbeat expiry must be after heartbeat time");
    const heartbeatDir = path.join(this.coordinationDir, "heartbeats", id);
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
    const heartbeatDir = path.join(this.coordinationDir, "heartbeats", id);
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
      await fs.access(path.join(this.coordinationDir, "terminal", `${id}.json`));
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
    const markerPath = path.join(this.coordinationDir, "terminal", `${id}.json`);
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
    const counterPath = path.join(this.coordinationDir, "ordinals", `${id}.txt`);
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
    const counterPath = path.join(this.coordinationDir, "ordinals", `${id}.txt`);
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
      return { targetSetSha256, selectedResultSetSha256, succeeded, observedFailures };
    }
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
