import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../limiter.js";
import { NonRetryableError } from "../retry.js";
import { TestClock } from "./test-clock.js";

describe("RateLimiter", () => {
  it("caps concurrency", async () => {
    const limiter = new RateLimiter({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    const tick = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };
    await Promise.all(Array.from({ length: 8 }, () => limiter.schedule(tick)));
    expect(peak).toBe(2);
  });

  it("propagates result on success", async () => {
    const limiter = new RateLimiter({ concurrency: 1 });
    await expect(limiter.schedule(async () => 42)).resolves.toBe(42);
  });

  it("retries transient errors then succeeds", async () => {
    const limiter = new RateLimiter({
      concurrency: 1,
      retry: { retries: 3, sleep: async () => {}, jitter: false, baseDelayMs: 1 },
    });
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce("ok");
    await expect(limiter.schedule(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("acquires a fresh throughput token for every retry attempt", async () => {
    const clock = new TestClock();
    const events: string[] = [];
    const limiter = new RateLimiter({
      concurrency: 1,
      bucket: { size: 1, refillPerSec: 1 },
      retry: {
        retries: 1,
        sleep: async () => {},
        jitter: false,
        baseDelayMs: 1,
      },
      clock,
      onEvent: (event) => events.push(event.type),
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const result = limiter.schedule(operation);
    for (let turn = 0; turn < 10 && !events.includes("bucket-queued"); turn += 1) {
      await Promise.resolve();
    }
    expect(operation).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event === "bucket-queued")).toHaveLength(1);

    clock.advance(1_000);
    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event === "bucket-acquired")).toHaveLength(2);
  });

  it("does not retry CircuitOpenError even when retry is configured", async () => {
    const limiter = new RateLimiter({
      concurrency: 1,
      breaker: { threshold: 1, cooldownMs: 60_000, windowMs: 60_000 },
      retry: { retries: 5, sleep: async () => {}, jitter: false, baseDelayMs: 1 },
    });
    // First call trips the breaker open
    await expect(
      limiter.schedule(async () => {
        throw new Error("trip");
      }),
    ).rejects.toThrow();
    // Second call: breaker is open. Retry policy must NOT retry on NonRetryableError.
    const fn = vi.fn();
    await expect(limiter.schedule(fn)).rejects.toThrow(NonRetryableError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("emits unified events via onEvent", async () => {
    const events: string[] = [];
    const limiter = new RateLimiter({
      concurrency: 1,
      onEvent: (e) => events.push(e.type),
    });
    await limiter.schedule(async () => 42);
    expect(events).toContain("gate-acquired");
    expect(events).toContain("gate-released");
  });
});
