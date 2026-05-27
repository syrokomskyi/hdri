import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('stays closed while failures are under threshold', async () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, windowMs: 10_000 });
    for (let i = 0; i < 2; i++) {
      await expect(breaker.exec(async () => { throw new Error('x'); })).rejects.toThrow('x');
    }
    expect(breaker.getState()).toBe('closed');
  });

  it('opens when threshold is hit, rejects fast, then half-opens after cooldown', async () => {
    let now = 1000;
    const breaker = new CircuitBreaker({
      threshold: 2, cooldownMs: 500, windowMs: 10_000, now: () => now,
    });
    await expect(breaker.exec(async () => { throw new Error('1'); })).rejects.toThrow();
    await expect(breaker.exec(async () => { throw new Error('2'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    // Fast-rejects while open
    await expect(breaker.exec(async () => 'ok')).rejects.toThrow(CircuitOpenError);

    now += 600; // pass cooldown
    expect(breaker.getState()).toBe('half-open');
  });

  it('half-open → closed on probe success', async () => {
    let now = 1000;
    const breaker = new CircuitBreaker({
      threshold: 1, cooldownMs: 100, windowMs: 10_000, now: () => now,
    });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('open');
    now += 200;
    await expect(breaker.exec(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });

  it('half-open → open on probe failure, new cooldown', async () => {
    let now = 1000;
    const breaker = new CircuitBreaker({
      threshold: 1, cooldownMs: 100, windowMs: 10_000, now: () => now,
    });
    await expect(breaker.exec(async () => { throw new Error('boom'); })).rejects.toThrow();
    now += 200;
    expect(breaker.getState()).toBe('half-open');
    await expect(breaker.exec(async () => { throw new Error('still broken'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('open');
  });

  it('isFailure=false → does not count toward threshold', async () => {
    const breaker = new CircuitBreaker({
      threshold: 2, cooldownMs: 100, windowMs: 10_000,
      isFailure: (e) => !(e instanceof RangeError),
    });
    for (let i = 0; i < 5; i++) {
      await expect(breaker.exec(async () => { throw new RangeError('ignored'); })).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('closed');
  });
});
