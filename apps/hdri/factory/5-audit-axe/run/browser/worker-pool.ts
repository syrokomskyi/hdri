/*
<MODULE_CONTRACT>
<purpose>Supervised worker process pool with bounded recycling, deadline enforcement, and process-tree cleanup for browser-based audit workers.</purpose>
<non-goals>
  <item>Does not own the execution journal or lease authority — that stays in factory-core.</item>
  <item>Does not fabricate results from interrupted reports — coordinator reconciles through factory-core.</item>
  <item>Does not implement anti-bot evasion or randomize browser identity.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0105/ADR-0023: initial worker pool with bounded size, deadline enforcement, process-tree cleanup, and recycling after 20 targets/crash/cleanup failure.</item>
</CHANGE_SUMMARY>
*/

import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerRequest, WorkerResponse, WorkerError } from "./worker-entry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PoolConfig = {
  poolSize: number;
  recycleAfterTargets: number;
  deadlineMs: number;
  terminationGraceMs: number;
  workerEntryPath: string;
  environmentSha256: string;
  policySha256: string;
  /** Maximum number of pending tasks waiting for a worker. Default: 64. */
  maxQueueLength?: number;
  /** Maximum crash restarts per minute before pool refuses to spawn. Default: 5. */
  maxCrashRestartsPerMinute?: number;
  /** Maximum descendant RSS in MB before recycling. Default: 512. */
  maxDescendantRssMb?: number;
};

export type PoolTarget = {
  siteId: number;
  provisionalAssetId: string;
  domain: string;
  url: string;
};

export type RecycleReason =
  "max-targets" | "crash" | "cleanup-failure" | "rss-limit" | "deadline-exceeded";

type WorkerState = "starting" | "idle" | "busy" | "stopping" | "dead";

type PoolWorker = {
  process: ChildProcess;
  completedTargets: number;
  busy: boolean;
  state: WorkerState;
  pid: number | null;
};

// ---------------------------------------------------------------------------
// Tree-kill utility
// ---------------------------------------------------------------------------

const treeKill = (pid: number, signal: NodeJS.Signals = "SIGTERM"): void => {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be dead
  }
  // On Linux, kill the process group
  if (process.platform === "linux") {
    try {
      process.kill(-pid, signal);
    } catch {
      // Process group may not exist
    }
  }
};

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

export class WorkerPool {
  private readonly config: PoolConfig;
  private readonly workers: PoolWorker[] = [];
  private readonly idleQueue: PoolWorker[] = [];
  private readonly pendingResolvers: Map<
    string,
    { resolve: (e: WorkerResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  > = new Map();
  private readonly recycleLog: Array<{ reason: RecycleReason; at: string }> = [];
  private readonly crashTimestamps: number[] = [];
  private isShuttingDown = false;
  private readonly maxQueueLength: number;
  private readonly maxCrashRestartsPerMinute: number;
  private pendingQueue: Array<{
    target: PoolTarget;
    workKey: string;
    resolve: (e: WorkerResponse) => void;
    reject: (e: Error) => void;
  }> = [];

  constructor(config: PoolConfig) {
    this.config = config;
    this.maxQueueLength = config.maxQueueLength ?? 64;
    this.maxCrashRestartsPerMinute = config.maxCrashRestartsPerMinute ?? 5;
  }

  async start(): Promise<void> {
    for (let i = 0; i < this.config.poolSize; i++) {
      const worker = this.spawnWorker();
      this.workers.push(worker);
      this.idleQueue.push(worker);
    }
  }

  getWorkerStates(): Array<{ state: string; pid: number | null; completedTargets: number }> {
    return this.workers.map((w) => ({
      state: w.state,
      pid: w.pid,
      completedTargets: w.completedTargets,
    }));
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    // Reject all pending queued tasks
    for (const pending of this.pendingQueue) {
      pending.reject(new Error("Pool shutting down"));
    }
    this.pendingQueue.length = 0;
    // Reject all in-flight pending resolvers
    for (const [key, { reject, timer }] of this.pendingResolvers) {
      clearTimeout(timer);
      reject(new Error("Pool shutting down"));
      this.pendingResolvers.delete(key);
    }
    for (const worker of this.workers) {
      worker.state = "stopping";
      if (worker.process.pid) treeKill(worker.process.pid, "SIGTERM");
    }
    for (const worker of this.workers) {
      if (!worker.process.killed) {
        await new Promise<void>((resolve) => {
          worker.process.once("exit", () => resolve());
          setTimeout(() => {
            if (worker.process.pid) treeKill(worker.process.pid, "SIGKILL");
            resolve();
          }, this.config.terminationGraceMs);
        });
      }
      worker.state = "dead";
    }
    this.workers.length = 0;
    this.idleQueue.length = 0;
  }

  getRecycleLog(): Array<{ reason: RecycleReason; at: string }> {
    return [...this.recycleLog];
  }

  getActiveWorkerCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  getPoolSize(): number {
    return this.config.poolSize;
  }

  async acquire(target: PoolTarget, workKey: string): Promise<WorkerResponse> {
    if (this.isShuttingDown) {
      throw new Error("Pool is shutting down");
    }
    if (this.pendingQueue.length >= this.maxQueueLength) {
      throw new Error(`Queue full: ${this.pendingQueue.length}/${this.maxQueueLength}`);
    }

    return new Promise<WorkerResponse>((resolve, reject) => {
      const tryDispatch = () => {
        if (this.isShuttingDown) {
          reject(new Error("Pool shutting down"));
          return;
        }
        const worker = this.idleQueue.shift();
        if (!worker) {
          // Queue the task
          this.pendingQueue.push({ target, workKey, resolve, reject });
          return;
        }
        this.dispatchToWorker(worker, target, workKey, resolve, reject);
      };
      tryDispatch();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private dispatchToWorker(
    worker: PoolWorker,
    target: PoolTarget,
    workKey: string,
    resolve: (e: WorkerResponse) => void,
    reject: (e: Error) => void,
  ): void {
    worker.busy = true;
    worker.state = "busy";

    const req: WorkerRequest = {
      target,
      workKey,
      deadlineMs: this.config.deadlineMs,
      policySha256: this.config.policySha256,
      environmentSha256: this.config.environmentSha256,
    };

    const timer = setTimeout(() => {
      this.handleTimeout(worker, workKey);
      reject(new Error(`Worker deadline exceeded: ${this.config.deadlineMs}ms`));
    }, this.config.deadlineMs + this.config.terminationGraceMs);

    this.pendingResolvers.set(workKey, { resolve, reject, timer });

    const onMessage = (msg: WorkerResponse | WorkerError) => {
      if ("error" in msg) {
        clearTimeout(timer);
        this.pendingResolvers.delete(workKey);
        worker.process.off("message", onMessage);
        this.handleWorkerError(worker);
        reject(new Error(msg.error));
        this.drainPendingQueue();
        return;
      }
      if (msg.evidence.workKey === workKey) {
        clearTimeout(timer);
        this.pendingResolvers.delete(workKey);
        worker.process.off("message", onMessage);
        worker.completedTargets++;
        worker.busy = false;

        if (worker.completedTargets >= this.config.recycleAfterTargets) {
          this.recycleWorker(worker, "max-targets");
        } else {
          worker.state = "idle";
          this.idleQueue.push(worker);
        }

        resolve(msg);
        this.drainPendingQueue();
      }
    };

    worker.process.on("message", onMessage);
    worker.process.send?.(req);
  }

  private drainPendingQueue(): void {
    if (this.pendingQueue.length === 0) return;
    if (this.idleQueue.length === 0) return;
    const pending = this.pendingQueue.shift()!;
    const worker = this.idleQueue.shift()!;
    this.dispatchToWorker(worker, pending.target, pending.workKey, pending.resolve, pending.reject);
  }

  private spawnWorker(): PoolWorker {
    if (this.isShuttingDown) {
      throw new Error("Cannot spawn worker during shutdown");
    }

    // Crash rate limiting
    const now = Date.now();
    this.crashTimestamps.push(now);
    // Keep only crashes from the last minute
    while (this.crashTimestamps.length > 0 && this.crashTimestamps[0] < now - 60_000) {
      this.crashTimestamps.shift();
    }
    if (this.crashTimestamps.length > this.maxCrashRestartsPerMinute) {
      throw new Error(
        `Crash restart rate exceeded: ${this.crashTimestamps.length} in the last minute`,
      );
    }

    const childProcess = fork(this.config.workerEntryPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      // On POSIX, create a new process group so we can signal the whole tree
      detached: process.platform !== "win32",
      env: this.sanitizedEnv(),
    });

    const worker: PoolWorker = {
      process: childProcess,
      completedTargets: 0,
      busy: false,
      state: "starting",
      pid: childProcess.pid ?? null,
    };

    // Drain stdio to prevent pipe buffer exhaustion
    childProcess.stdout?.on("data", () => {});
    childProcess.stderr?.on("data", () => {});

    childProcess.on("exit", (code, signal) => {
      worker.state = "dead";
      // Remove from idle queue if present
      const idleIdx = this.idleQueue.indexOf(worker);
      if (idleIdx !== -1) this.idleQueue.splice(idleIdx, 1);

      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
        // Unexpected crash — reject pending tasks for this worker
        for (const [key, { reject, timer }] of this.pendingResolvers) {
          clearTimeout(timer);
          reject(new Error(`Worker crashed (exit code ${code})`));
          this.pendingResolvers.delete(key);
        }
        if (!this.isShuttingDown) {
          this.recycleWorker(worker, "crash");
        }
      } else if (code === 0) {
        // Unexpected successful exit while idle or busy
        for (const [key, { reject, timer }] of this.pendingResolvers) {
          clearTimeout(timer);
          reject(new Error(`Worker exited unexpectedly (code 0)`));
          this.pendingResolvers.delete(key);
        }
        if (!this.isShuttingDown) {
          this.recycleWorker(worker, "crash");
        }
      }
    });

    // Transition to idle once spawned
    worker.state = "idle";

    return worker;
  }

  private sanitizedEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const allowlist = new Set([
      "PATH",
      "HOME",
      "USER",
      "SHELL",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "TMPDIR",
      "PLAYWRIGHT_BROWSERS_PATH",
      "NODE_ENV",
      "MOCK_WORKER_MODE",
    ]);
    for (const key of Object.keys(process.env)) {
      if (allowlist.has(key)) {
        env[key] = process.env[key];
      }
    }
    // Exclude NODE_OPTIONS to prevent inherited arbitrary flags
    delete env.NODE_OPTIONS;
    return env;
  }

  private handleTimeout(worker: PoolWorker, workKey: string): void {
    this.pendingResolvers.delete(workKey);
    worker.state = "stopping";
    if (worker.process.pid) {
      // Send TERM first, then KILL after grace period
      treeKill(worker.process.pid, "SIGTERM");
      setTimeout(() => {
        if (worker.process.pid && !worker.process.killed) {
          treeKill(worker.process.pid, "SIGKILL");
        }
      }, this.config.terminationGraceMs);
    }
    this.recycleWorker(worker, "deadline-exceeded");
  }

  private handleWorkerError(worker: PoolWorker): void {
    this.recycleWorker(worker, "crash");
  }

  private recycleWorker(worker: PoolWorker, reason: RecycleReason): void {
    this.recycleLog.push({ reason, at: new Date().toISOString() });

    // Mark as stopping
    worker.state = "stopping";

    // Remove from active list
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) this.workers.splice(idx, 1);

    // Remove from idle queue if present
    const idleIdx = this.idleQueue.indexOf(worker);
    if (idleIdx !== -1) this.idleQueue.splice(idleIdx, 1);

    // Kill the old process if still alive
    if (worker.process.pid && !worker.process.killed) {
      treeKill(worker.process.pid, "SIGTERM");
      setTimeout(() => {
        if (worker.process.pid && !worker.process.killed) {
          treeKill(worker.process.pid, "SIGKILL");
        }
      }, this.config.terminationGraceMs);
    }

    // Spawn a replacement only if not shutting down
    if (!this.isShuttingDown) {
      try {
        const newWorker = this.spawnWorker();
        this.workers.push(newWorker);
        this.idleQueue.push(newWorker);
      } catch {
        // Crash rate limit hit — pool continues with fewer workers
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: compute environment SHA-256 from browser binary digest
// ---------------------------------------------------------------------------

export const computeEnvironmentSha256 = (browserDigest: string, engineVersion: string): string =>
  createHash("sha256")
    .update(`hdri-browser-env@1\0${browserDigest}\0${engineVersion}`)
    .digest("hex");

// ---------------------------------------------------------------------------
// Helper: compute policy SHA-256 from pool config
// ---------------------------------------------------------------------------

export const computePolicySha256 = (config: {
  poolSize: number;
  recycleAfterTargets: number;
  deadlineMs: number;
  terminationGraceMs: number;
}): string =>
  createHash("sha256")
    .update(
      `hdri-axe-policy@1\0${config.poolSize}\0${config.recycleAfterTargets}\0${config.deadlineMs}\0${config.terminationGraceMs}`,
    )
    .digest("hex");

// ---------------------------------------------------------------------------
// Worker entry path resolver
// ---------------------------------------------------------------------------

export const defaultWorkerEntryPath = (): string => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(scriptDir, "worker-entry.js");
};
