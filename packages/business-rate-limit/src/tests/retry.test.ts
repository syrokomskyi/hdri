import { describe, expect, it, vi } from 'vitest';
import { retry, computeBackoffMs } from '../retry.js';

describe('retry()', () => {
  it('returns on first success without sleeping', async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retry(fn, { sleep, retries: 3 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries until success', async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('win');
    await expect(retry(fn, { sleep, retries: 3, jitter: false })).resolves.toBe('win');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retry(fn, {
      retries: 2, sleep: async () => {}, jitter: false,
    })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry=false predicate (stops immediately)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(retry(fn, {
      retries: 5, sleep: async () => {},
      shouldRetry: () => false,
    })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts via AbortSignal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(retry(async () => 'x', { signal: ac.signal })).rejects.toThrow();
  });

  it('computeBackoffMs grows exponentially and caps', () => {
    const rand = () => 1; // no jitter cutting
    expect(computeBackoffMs(0, 100, 10_000, false, rand)).toBe(100);
    expect(computeBackoffMs(1, 100, 10_000, false, rand)).toBe(200);
    expect(computeBackoffMs(4, 100, 10_000, false, rand)).toBe(1600);
    expect(computeBackoffMs(20, 100, 10_000, false, rand)).toBe(10_000);
  });
});
