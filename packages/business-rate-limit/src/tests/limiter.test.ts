import { describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../limiter.js';
import { CircuitOpenError } from '../circuit-breaker.js';

describe('RateLimiter', () => {
  it('caps concurrency', async () => {
    const limiter = new RateLimiter({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    const tick = async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };
    await Promise.all(Array.from({ length: 8 }, () => limiter.schedule(tick)));
    expect(peak).toBe(2);
  });

  it('propagates result on success', async () => {
    const limiter = new RateLimiter({ concurrency: 1 });
    await expect(limiter.schedule(async () => 42)).resolves.toBe(42);
  });

  it('retries transient errors then succeeds', async () => {
    const limiter = new RateLimiter({
      concurrency: 1,
      retry: { retries: 3, sleep: async () => {}, jitter: false, baseDelayMs: 1 },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce('ok');
    await expect(limiter.schedule(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry CircuitOpenError even when retry is configured', async () => {
    const limiter = new RateLimiter({
      concurrency: 1,
      breaker: { threshold: 1, cooldownMs: 60_000, windowMs: 60_000 },
      retry: { retries: 5, sleep: async () => {}, jitter: false, baseDelayMs: 1 },
    });
    // First call trips the breaker open
    await expect(limiter.schedule(async () => { throw new Error('trip'); })).rejects.toThrow();
    // Second call: breaker is open. Retry policy must NOT retry on CircuitOpenError.
    const fn = vi.fn();
    await expect(limiter.schedule(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });
});
