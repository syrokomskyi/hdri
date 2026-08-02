import { describe, expect, it, vi } from "vitest";
import { TokenBucket } from "../token-bucket.js";
import { TestClock } from "./test-clock.js";

describe("TokenBucket", () => {
  it("fills to capacity at construction and tryAcquire consumes", () => {
    const bucket = new TokenBucket({ size: 3, refillPerSec: 1 });
    expect(bucket.tryAcquire(3)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
  });

  it("refills linearly over time", () => {
    const clock = new TestClock();
    const bucket = new TokenBucket({ size: 10, refillPerSec: 10, clock });
    expect(bucket.tryAcquire(10)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
    clock.advance(500); // half a second → 5 tokens refilled
    expect(bucket.available()).toBeCloseTo(5, 5);
    expect(bucket.tryAcquire(5)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
  });

  it("caps at size on prolonged idle", () => {
    const clock = new TestClock();
    const bucket = new TokenBucket({ size: 4, refillPerSec: 10, clock });
    clock.advance(60_000);
    expect(bucket.available()).toBe(4);
  });

  it("async acquire waits until tokens are refilled", async () => {
    const clock = new TestClock();
    const bucket = new TokenBucket({ size: 2, refillPerSec: 2, clock });
    await bucket.acquire(2); // drain
    let resolved = false;
    const p = bucket.acquire(1).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    clock.advance(400); // 2 tok/s × 0.4s = 0.8 tok → still not enough
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    clock.advance(200); // another 0.2s → total 1.2 tokens → enough for n=1
    await p;
    expect(resolved).toBe(true);
  });

  it("FIFO: earlier waiter is served first even if later needs fewer tokens", async () => {
    const clock = new TestClock();
    const bucket = new TokenBucket({ size: 5, refillPerSec: 5, clock });
    await bucket.acquire(5); // drain
    const order: string[] = [];
    const pA = bucket.acquire(3).then(() => order.push("A"));
    const pB = bucket.acquire(1).then(() => order.push("B"));
    clock.advance(1000); // +5 tokens — first resolves A (needs 3), leaves 2, then B.
    await Promise.all([pA, pB]);
    expect(order).toEqual(["A", "B"]);
  });

  it("rejects requests larger than capacity", () => {
    const bucket = new TokenBucket({ size: 3, refillPerSec: 1 });
    expect(() => bucket.tryAcquire(4)).toThrow();
  });

  it("fires onAcquire and onQueue callbacks", async () => {
    const clock = new TestClock();
    const acquires: Array<{ remaining: number; cost: number }> = [];
    const queues: number[] = [];
    const bucket = new TokenBucket({
      size: 2,
      refillPerSec: 2,
      clock,
      onAcquire: (remaining, cost) => acquires.push({ remaining, cost }),
      onQueue: (waiters) => queues.push(waiters),
    });
    bucket.tryAcquire(1); // fast path, no queue
    expect(acquires).toEqual([{ remaining: 1, cost: 1 }]);
    expect(queues).toEqual([]);
    // Drain remaining token
    await bucket.acquire(1);
    // Now queue a waiter
    const p = bucket.acquire(1);
    expect(queues).toEqual([1]);
    clock.advance(500);
    await p;
    expect(acquires.length).toBe(3);
  });

  it("keeps the production process alive while a queued token is promised", async () => {
    const unref = vi.fn();
    const bucket = new TokenBucket({
      size: 1,
      refillPerSec: 1,
      clock: {
        now: () => 0,
        random: () => 0,
        setTimeout: () => ({ unref }),
      },
    });
    await bucket.acquire();
    void bucket.acquire();
    expect(unref).not.toHaveBeenCalled();
  });
});
