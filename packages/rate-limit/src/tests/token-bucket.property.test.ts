import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { TokenBucket } from "../token-bucket.js";
import { TestClock } from "./test-clock.js";

describe("TokenBucket — property-based", () => {
  it("available() never exceeds size, regardless of time advancement", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 600_000 }),
        (size, refill, advanceMs) => {
          const clock = new TestClock();
          const bucket = new TokenBucket({ size, refillPerSec: refill, clock });
          clock.advance(advanceMs);
          expect(bucket.available()).toBeLessThanOrEqual(size);
        },
      ),
    );
  });

  it("tryAcquire(n) never makes available() go negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 1, max: 50 }), { maxLength: 20 }),
        (size, refill, requests) => {
          fc.pre(requests.every((n) => n <= size));
          const clock = new TestClock();
          const bucket = new TokenBucket({ size, refillPerSec: refill, clock });
          for (const n of requests) {
            bucket.tryAcquire(n);
          }
          expect(bucket.available()).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("after full drain, available() is 0, and after enough time it refills to <= size", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (size, refill) => {
          const clock = new TestClock();
          const bucket = new TokenBucket({ size, refillPerSec: refill, clock });
          expect(bucket.tryAcquire(size)).toBe(true);
          expect(bucket.available()).toBe(0);
          const refillMs = Math.ceil((size / refill) * 1000) + 100;
          clock.advance(refillMs);
          expect(bucket.available()).toBeCloseTo(size, 1);
        },
      ),
    );
  });

  it("tryAcquire(n > size) always throws", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 200 }),
        (size, refill, n) => {
          fc.pre(n > size);
          const bucket = new TokenBucket({ size, refillPerSec: refill });
          expect(() => bucket.tryAcquire(n)).toThrow();
        },
      ),
    );
  });

  it("total tokens acquired never exceed size + refill amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.array(fc.integer({ min: 1, max: 10 }), { maxLength: 30 }),
        (size, refill, advanceMs, requests) => {
          const clock = new TestClock();
          const bucket = new TokenBucket({ size, refillPerSec: refill, clock });
          clock.advance(advanceMs);
          let acquired = 0;
          for (const n of requests) {
            if (n > size) continue;
            if (bucket.tryAcquire(n)) acquired += n;
          }
          const maxAvailable = size + (advanceMs / 1000) * refill;
          expect(acquired).toBeLessThanOrEqual(maxAvailable + 1e-9);
        },
      ),
    );
  });
});
