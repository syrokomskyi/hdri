import { describe, expect, it } from "vitest";
import { ConcurrencyGate } from "../concurrency-gate.js";

describe("ConcurrencyGate", () => {
  it("throws on limit <= 0", () => {
    expect(() => new ConcurrencyGate(0)).toThrow();
    expect(() => new ConcurrencyGate(-1)).toThrow();
    expect(() => new ConcurrencyGate(Infinity)).toThrow();
    expect(() => new ConcurrencyGate(NaN)).toThrow();
  });

  it("allows up to limit concurrent tasks", async () => {
    const gate = new ConcurrencyGate(3);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    };
    await Promise.all(Array.from({ length: 6 }, () => gate.run(task)));
    expect(peak).toBe(3);
  });

  it("reports inFlight and queueDepth correctly", async () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.inFlight()).toBe(0);
    expect(gate.queueDepth()).toBe(0);

    const p1 = gate.run(() => new Promise<void>((r) => setTimeout(r, 50)));
    const p2 = gate.run(() => new Promise<void>((r) => setTimeout(r, 50)));
    // Let them start
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.inFlight()).toBe(2);
    expect(gate.queueDepth()).toBe(0);

    const p3 = gate.run(() => new Promise<void>((r) => setTimeout(r, 50)));
    await Promise.resolve();
    expect(gate.inFlight()).toBe(2);
    expect(gate.queueDepth()).toBe(1);

    await Promise.all([p1, p2, p3]);
    expect(gate.inFlight()).toBe(0);
    expect(gate.queueDepth()).toBe(0);
  });

  it("processes queued tasks in FIFO order", async () => {
    const gate = new ConcurrencyGate(1);
    const order: string[] = [];
    const make = (id: string) =>
      gate.run(async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, 10));
      });
    await Promise.all([make("a"), make("b"), make("c")]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("fires onAcquire and onRelease callbacks", async () => {
    const acquires: number[] = [];
    const releases: Array<{ inFlight: number; queueDepth: number }> = [];
    const gate = new ConcurrencyGate(2, {
      onAcquire: (inFlight) => acquires.push(inFlight),
      onRelease: (inFlight, queueDepth) => releases.push({ inFlight, queueDepth }),
    });
    await Promise.all([gate.run(async () => "a"), gate.run(async () => "b")]);
    expect(acquires).toContain(1);
    expect(acquires).toContain(2);
    expect(releases.length).toBe(2);
  });

  it("propagates errors and still releases the slot", async () => {
    const gate = new ConcurrencyGate(1);
    await expect(
      gate.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(gate.inFlight()).toBe(0);
    // Gate should still accept new tasks
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });

  it("limit=1 serializes all tasks", async () => {
    const gate = new ConcurrencyGate(1);
    const results: number[] = [];
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 5 }, (_, i) =>
      gate.run(async () => {
        active++;
        peak = Math.max(peak, active);
        results.push(i);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBe(1);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });
});
