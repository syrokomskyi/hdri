import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeBackoffMs, retry, NonRetryableError } from "../retry.js";

describe("retry — property-based", () => {
  it("computeBackoffMs without jitter is min(maxMs, base * 2^attempt)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 10, max: 100_000 }),
        (attempt, base, max) => {
          fc.pre(base * 2 ** attempt <= max || true);
          const result = computeBackoffMs(attempt, base, max, false, () => 0);
          const expected = Math.min(max, base * 2 ** attempt);
          expect(result).toBe(expected);
        },
      ),
    );
  });

  it("computeBackoffMs with jitter is always in [0, min(max, base*2^attempt)]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 10, max: 100_000 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (attempt, base, max, rand) => {
          const result = computeBackoffMs(attempt, base, max, true, () => rand);
          const upper = Math.min(max, base * 2 ** attempt);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(upper);
        },
      ),
    );
  });

  it("computeBackoffMs never exceeds maxMs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.boolean(),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (attempt, base, max, jitter, rand) => {
          const result = computeBackoffMs(attempt, base, max, jitter, () => rand);
          expect(result).toBeLessThanOrEqual(max);
        },
      ),
    );
  });

  it("retry calls fn at most retries+1 times", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (retries) => {
        let calls = 0;
        try {
          await retry(
            async () => {
              calls++;
              throw new Error("fail");
            },
            { retries, sleep: async () => {}, jitter: false },
          );
        } catch {
          // expected
        }
        expect(calls).toBe(retries + 1);
      }),
    );
  });

  it("retry with NonRetryableError stops after first attempt", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (retries) => {
        let calls = 0;
        try {
          await retry(
            async () => {
              calls++;
              throw new NonRetryableError(new Error("nope"));
            },
            { retries, sleep: async () => {} },
          );
        } catch {
          // expected
        }
        expect(calls).toBe(1);
      }),
    );
  });
});
