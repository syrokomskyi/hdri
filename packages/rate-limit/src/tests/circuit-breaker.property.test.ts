import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CircuitBreaker, type BreakerState } from "../circuit-breaker.js";
import { TestClock } from "./test-clock.js";

describe("CircuitBreaker — property-based", () => {
  it("stays closed when successes outnumber failures (threshold never hit)", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 20 }),
        fc.array(fc.boolean(), { minLength: 5, maxLength: 50 }),
        async (threshold, outcomes) => {
          // Ensure not enough consecutive failures to trip
          fc.pre(outcomes.filter((b) => !b).length < threshold);
          const breaker = new CircuitBreaker({
            threshold,
            windowMs: 100_000,
            cooldownMs: 1000,
          });
          for (const success of outcomes) {
            try {
              await breaker.exec(async () => {
                if (!success) throw new Error("fail");
                return "ok";
              });
            } catch {
              // expected
            }
          }
          expect(breaker.getState()).toBe("closed");
        },
      ),
    );
  });

  it("state is always one of closed|open|half-open", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (threshold) => {
        const breaker = new CircuitBreaker({ threshold });
        const state = breaker.getState() as BreakerState;
        expect(["closed", "open", "half-open"]).toContain(state);
      }),
    );
  });

  it("after opening, getState returns 'open' until cooldown elapses", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 100, max: 5000 }),
        async (threshold, cooldownMs) => {
          const clock = new TestClock(0);
          const breaker = new CircuitBreaker({
            threshold,
            cooldownMs,
            windowMs: 100_000,
            clock,
          });
          for (let i = 0; i < threshold; i++) {
            try {
              await breaker.exec(async () => {
                throw new Error("x");
              });
            } catch {
              // expected
            }
          }
          expect(breaker.getState()).toBe("open");
          // Just before cooldown
          clock.advance(cooldownMs - 1);
          expect(breaker.getState()).toBe("open");
          // After cooldown
          clock.advance(1);
          expect(breaker.getState()).toBe("half-open");
        },
      ),
    );
  });
});
