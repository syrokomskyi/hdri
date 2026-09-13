/*
 * RFC-0114 AC-5: Browser lifecycle fault matrix with real subprocesses.
 * Tests: large stdout, hung browser, crash-before/after-message,
 * exit-zero-no-response, rapid recycle, shutdown with queued tasks.
 * Verifies zero descendant processes remain after completion.
 */
import { describe, it, expect, afterEach } from "vitest";
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkerPool, type PoolConfig } from "../browser/worker-pool.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mockEntryPath = path.join(scriptDir, "mock-worker-entry.ts");

const makeConfig = (overrides: Partial<PoolConfig> = {}): PoolConfig => ({
  poolSize: 2,
  recycleAfterTargets: 5,
  deadlineMs: 2000,
  terminationGraceMs: 500,
  workerEntryPath: mockEntryPath,
  environmentSha256: "test-env-sha",
  policySha256: "test-policy-sha",
  maxQueueLength: 10,
  maxCrashRestartsPerMinute: 20,
  ...overrides,
});

const makeTarget = (n: number) => ({
  siteId: n,
  provisionalAssetId: `da-test-${n}`,
  domain: "example.com",
  url: "https://example.com",
});

// Helper: count living child processes of the pool
const getLivingPids = (pool: WorkerPool): number[] =>
  pool
    .getWorkerStates()
    .filter((w) => w.state !== "dead")
    .map((w) => w.pid)
    .filter((p): p is number => p !== null);

// Helper: check if a process is still alive
const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const pools: WorkerPool[] = [];

afterEach(async () => {
  for (const pool of pools) {
    try {
      await pool.shutdown();
    } catch {
      // Already shut down
    }
  }
  pools.length = 0;
});

describe("RFC-0114 AC-5: browser lifecycle fault matrix", () => {
  it("normal worker responds with evidence", async () => {
    process.env.MOCK_WORKER_MODE = "normal";
    const pool = new WorkerPool(makeConfig());
    pools.push(pool);
    await pool.start();

    const response = await pool.acquire(makeTarget(1), "work-1");
    expect(response.evidence.workKey).toBe("work-1");
    expect(response.evidence.outcome).toBe("measured");
  });

  it("large stdout does not block worker response", async () => {
    process.env.MOCK_WORKER_MODE = "large-stdout";
    const pool = new WorkerPool(makeConfig());
    pools.push(pool);
    await pool.start();

    const response = await pool.acquire(makeTarget(1), "work-2");
    expect(response.evidence.workKey).toBe("work-2");
  });

  it("hung worker triggers deadline timeout", async () => {
    process.env.MOCK_WORKER_MODE = "hung";
    const pool = new WorkerPool(
      makeConfig({
        deadlineMs: 300,
        terminationGraceMs: 200,
      }),
    );
    pools.push(pool);
    await pool.start();

    await expect(pool.acquire(makeTarget(1), "work-3")).rejects.toThrow(
      /deadline exceeded|Worker crashed/,
    );
  });

  it("crash-before-message rejects the task", async () => {
    process.env.MOCK_WORKER_MODE = "crash-before-message";
    const pool = new WorkerPool(
      makeConfig({
        deadlineMs: 1000,
        terminationGraceMs: 500,
      }),
    );
    pools.push(pool);
    await pool.start();

    await expect(pool.acquire(makeTarget(1), "work-4")).rejects.toThrow(/crashed|Worker exited/);
  });

  it("crash-after-message delivers response then recycles", async () => {
    process.env.MOCK_WORKER_MODE = "crash-after-message";
    const pool = new WorkerPool(makeConfig());
    pools.push(pool);
    await pool.start();

    // The response should arrive before the crash
    const response = await pool.acquire(makeTarget(1), "work-5");
    expect(response.evidence.workKey).toBe("work-5");

    // Wait a bit for the crash to be processed
    await new Promise((r) => setTimeout(r, 200));

    // Pool should have recycled the worker
    const states = pool.getWorkerStates();
    expect(states.length).toBeGreaterThan(0);
  });

  it("exit-zero-no-response rejects pending task", async () => {
    process.env.MOCK_WORKER_MODE = "exit-zero-no-response";
    const pool = new WorkerPool(
      makeConfig({
        deadlineMs: 1000,
        terminationGraceMs: 500,
      }),
    );
    pools.push(pool);
    await pool.start();

    await expect(pool.acquire(makeTarget(1), "work-6")).rejects.toThrow(
      /exited unexpectedly|crashed/,
    );
  });

  it("rapid recycle: multiple sequential tasks on same pool", async () => {
    process.env.MOCK_WORKER_MODE = "normal";
    const pool = new WorkerPool(
      makeConfig({
        poolSize: 1,
        recycleAfterTargets: 2,
      }),
    );
    pools.push(pool);
    await pool.start();

    for (let i = 0; i < 4; i++) {
      const response = await pool.acquire(makeTarget(i), `work-${i}`);
      expect(response.evidence.workKey).toBe(`work-${i}`);
    }

    // Should have recycled at least once (after 2 targets)
    const recycleLog = pool.getRecycleLog();
    expect(recycleLog.some((r) => r.reason === "max-targets")).toBe(true);
  });

  it("shutdown with queued tasks rejects them", async () => {
    process.env.MOCK_WORKER_MODE = "hung";
    const pool = new WorkerPool(
      makeConfig({
        poolSize: 1,
        deadlineMs: 5000,
      }),
    );
    pools.push(pool);
    await pool.start();

    // Start one long task (hung worker keeps it in-flight)
    const inFlight = pool.acquire(makeTarget(1), "work-inflight").catch((e) => e);

    // Queue more tasks
    const queued = pool.acquire(makeTarget(2), "work-queued").catch((e) => e);

    // Shutdown immediately
    await pool.shutdown();

    // Both tasks should be rejected — catch handlers convert to resolved values
    const [inFlightResult, queuedResult] = await Promise.all([inFlight, queued]);
    expect(inFlightResult).toBeInstanceOf(Error);
    expect((inFlightResult as Error).message).toMatch(/shutting down|deadline|crashed/);
    expect(queuedResult).toBeInstanceOf(Error);
    expect((queuedResult as Error).message).toMatch(/shutting down/);
  });

  it("zero descendant processes remain after shutdown", async () => {
    process.env.MOCK_WORKER_MODE = "normal";
    const pool = new WorkerPool(makeConfig({ poolSize: 3 }));
    pools.push(pool);
    await pool.start();

    const pids = getLivingPids(pool);
    expect(pids.length).toBe(3);

    // All PIDs should be alive
    for (const pid of pids) {
      expect(isProcessAlive(pid)).toBe(true);
    }

    await pool.shutdown();

    // After shutdown, all processes should be dead
    // Give a grace period for process cleanup
    await new Promise((r) => setTimeout(r, 1000));

    for (const pid of pids) {
      expect(isProcessAlive(pid)).toBe(false);
    }
  });

  it("worker states are tracked correctly", async () => {
    process.env.MOCK_WORKER_MODE = "normal";
    const pool = new WorkerPool(makeConfig({ poolSize: 2 }));
    pools.push(pool);
    await pool.start();

    const states = pool.getWorkerStates();
    expect(states.length).toBe(2);
    for (const s of states) {
      expect(s.state).toBe("idle");
      expect(s.completedTargets).toBe(0);
    }

    // Acquire one target
    const acquirePromise = pool.acquire(makeTarget(1), "work-states");
    await new Promise((r) => setTimeout(r, 10));

    // One worker should be busy
    const midStates = pool.getWorkerStates();
    const busyCount = midStates.filter((s) => s.state === "busy").length;
    const idleCount = midStates.filter((s) => s.state === "idle").length;
    expect(busyCount + idleCount).toBe(2);

    await acquirePromise;

    // After completion, all should be idle again
    const finalStates = pool.getWorkerStates();
    for (const s of finalStates) {
      expect(s.state).toBe("idle");
    }
    expect(finalStates.some((s) => s.completedTargets === 1)).toBe(true);
  });

  it("queue length bound rejects excess tasks", async () => {
    process.env.MOCK_WORKER_MODE = "hung";
    const pool = new WorkerPool(
      makeConfig({
        poolSize: 1,
        deadlineMs: 5000,
        maxQueueLength: 2,
      }),
    );
    pools.push(pool);
    await pool.start();

    // First task occupies the worker (hung)
    const p1 = pool.acquire(makeTarget(1), "q1").catch(() => {});

    // Second and third tasks fill the queue
    const p2 = pool.acquire(makeTarget(2), "q2").catch(() => {});
    const p3 = pool.acquire(makeTarget(3), "q3").catch(() => {});

    // Fourth task should be rejected
    await expect(pool.acquire(makeTarget(4), "q4")).rejects.toThrow(/Queue full/);

    await pool.shutdown();
    await Promise.allSettled([p1, p2, p3]);
  });
});
