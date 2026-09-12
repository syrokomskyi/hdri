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
import type { BrowserEvidence } from "@syrokomskyi/factory-core";
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
};

export type PoolTarget = {
  siteId: number;
  provisionalAssetId: string;
  domain: string;
  url: string;
};

export type RecycleReason =
  | "max-targets"
  | "crash"
  | "cleanup-failure"
  | "rss-limit"
  | "deadline-exceeded";

type PoolWorker = {
  process: ChildProcess;
  completedTargets: number;
  busy: boolean;
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
    { resolve: (e: BrowserEvidence) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  > = new Map();
  private readonly recycleLog: Array<{ reason: RecycleReason; at: string }> = [];

  constructor(config: PoolConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    for (let i = 0; i < this.config.poolSize; i++) {
      const worker = this.spawnWorker();
      this.workers.push(worker);
      this.idleQueue.push(worker);
    }
  }

  async shutdown(): Promise<void> {
    for (const worker of this.workers) {
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

  async acquire(target: PoolTarget, workKey: string): Promise<BrowserEvidence> {
    const worker = await this.getIdleWorker();
    worker.busy = true;

    const req: WorkerRequest = {
      target,
      workKey,
      deadlineMs: this.config.deadlineMs,
      policySha256: this.config.policySha256,
      environmentSha256: this.config.environmentSha256,
    };

    return new Promise<BrowserEvidence>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handleTimeout(worker, workKey);
        reject(new Error(`Worker deadline exceeded: ${this.config.deadlineMs}ms`));
      }, this.config.deadlineMs + this.config.terminationGraceMs);

      this.pendingResolvers.set(workKey, { resolve, reject, timer });

      const onMessage = (msg: WorkerResponse | WorkerError) => {
        if ("error" in msg) {
          clearTimeout(timer);
          this.pendingResolvers.delete(workKey);
          this.handleWorkerError(worker);
          reject(new Error(msg.error));
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
            this.idleQueue.push(worker);
          }

          resolve(msg.evidence);
        }
      };

      worker.process.on("message", onMessage);
      worker.process.send?.(req);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private spawnWorker(): PoolWorker {
    const childProcess = fork(this.config.workerEntryPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    const worker: PoolWorker = {
      process: childProcess,
      completedTargets: 0,
      busy: false,
    };

    childProcess.on("exit", (code, signal) => {
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
        const idx = this.workers.indexOf(worker);
        if (idx !== -1) {
          this.recycleWorker(worker, "crash");
        }
      }
    });

    return worker;
  }

  private async getIdleWorker(): Promise<PoolWorker> {
    if (this.idleQueue.length > 0) {
      return this.idleQueue.shift()!;
    }
    // Wait for a worker to become idle
    return new Promise<PoolWorker>((resolve) => {
      const check = () => {
        if (this.idleQueue.length > 0) {
          resolve(this.idleQueue.shift()!);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private handleTimeout(worker: PoolWorker, workKey: string): void {
    this.pendingResolvers.delete(workKey);
    if (worker.process.pid) {
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

    // Remove from active list
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) this.workers.splice(idx, 1);

    // Kill the old process if still alive
    if (worker.process.pid && !worker.process.killed) {
      treeKill(worker.process.pid, "SIGTERM");
      setTimeout(() => {
        if (worker.process.pid && !worker.process.killed) {
          treeKill(worker.process.pid, "SIGKILL");
        }
      }, this.config.terminationGraceMs);
    }

    // Spawn a replacement
    const newWorker = this.spawnWorker();
    this.workers.push(newWorker);
    this.idleQueue.push(newWorker);
  }
}

// ---------------------------------------------------------------------------
// Helper: compute environment SHA-256 from browser binary digest
// ---------------------------------------------------------------------------

export const computeEnvironmentSha256 = (
  browserDigest: string,
  engineVersion: string,
): string =>
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
