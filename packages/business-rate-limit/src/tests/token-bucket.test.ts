import { describe, expect, it } from 'vitest';
import { TokenBucket, type Clock } from '../token-bucket.js';

/** Deterministic clock that records scheduled callbacks and advances manually. */
const makeTestClock = (): Clock & {
  advance: (ms: number) => void;
  pending: number;
} => {
  let nowMs = 1_000_000;
  const timers: Array<{ at: number; cb: () => void }> = [];

  const api = {
    now: () => nowMs,
    setTimeout: (cb: () => void, ms: number) => {
      timers.push({ at: nowMs + ms, cb });
      return {};
    },
    advance: (ms: number) => {
      const target = nowMs + ms;
      // Fire timers in order of scheduled time until we catch up.
      timers.sort((a, b) => a.at - b.at);
      while (timers.length > 0 && timers[0]!.at <= target) {
        const t = timers.shift()!;
        nowMs = t.at;
        t.cb();
        timers.sort((a, b) => a.at - b.at);
      }
      nowMs = target;
    },
    get pending() { return timers.length; },
  };
  return api as Clock & { advance: (ms: number) => void; pending: number };
};

describe('TokenBucket', () => {
  it('fills to capacity at construction and tryAcquire consumes', () => {
    const bucket = new TokenBucket({ size: 3, refillPerSec: 1 });
    expect(bucket.tryAcquire(3)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
  });

  it('refills linearly over time', () => {
    const clock = makeTestClock();
    const bucket = new TokenBucket({ size: 10, refillPerSec: 10, clock });
    expect(bucket.tryAcquire(10)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
    clock.advance(500); // half a second → 5 tokens refilled
    expect(bucket.available()).toBeCloseTo(5, 5);
    expect(bucket.tryAcquire(5)).toBe(true);
    expect(bucket.tryAcquire(1)).toBe(false);
  });

  it('caps at size on prolonged idle', () => {
    const clock = makeTestClock();
    const bucket = new TokenBucket({ size: 4, refillPerSec: 10, clock });
    clock.advance(60_000);
    expect(bucket.available()).toBe(4);
  });

  it('async acquire waits until tokens are refilled', async () => {
    const clock = makeTestClock();
    const bucket = new TokenBucket({ size: 2, refillPerSec: 2, clock });
    await bucket.acquire(2); // drain
    let resolved = false;
    const p = bucket.acquire(1).then(() => { resolved = true; });
    expect(resolved).toBe(false);
    clock.advance(400); // 2 tok/s × 0.4s = 0.8 tok → still not enough
    await Promise.resolve(); await Promise.resolve();
    expect(resolved).toBe(false);
    clock.advance(200); // another 0.2s → total 1.2 tokens → enough for n=1
    await p;
    expect(resolved).toBe(true);
  });

  it('FIFO: earlier waiter is served first even if later needs fewer tokens', async () => {
    const clock = makeTestClock();
    const bucket = new TokenBucket({ size: 5, refillPerSec: 5, clock });
    await bucket.acquire(5); // drain
    const order: string[] = [];
    const pA = bucket.acquire(3).then(() => order.push('A'));
    const pB = bucket.acquire(1).then(() => order.push('B'));
    clock.advance(1000); // +5 tokens — first resolves A (needs 3), leaves 2, then B.
    await Promise.all([pA, pB]);
    expect(order).toEqual(['A', 'B']);
  });

  it('rejects requests larger than capacity', () => {
    const bucket = new TokenBucket({ size: 3, refillPerSec: 1 });
    expect(() => bucket.tryAcquire(4)).toThrow();
  });
});
