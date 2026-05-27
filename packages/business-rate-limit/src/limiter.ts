/**
 * RateLimiter combines:
 *   - TokenBucket    — throttles calls per unit time (e.g. API RPM)
 *   - ConcurrencyGate — caps in-flight work
 *   - CircuitBreaker  — fails fast when an upstream is sick
 *   - retry()         — with exponential backoff + jitter
 *
 * The combination is deliberate: token-bucket waits for throughput, gate caps
 * parallelism, breaker prevents thundering herd on a broken upstream, and
 * retry smooths transient failures. Each call flows:
 *
 *   schedule() → [gate] → [bucket] → [breaker] → retry(fn)
 */

import { ConcurrencyGate } from './concurrency-gate.js';
import { CircuitBreaker, CircuitOpenError, type CircuitBreakerOptions } from './circuit-breaker.js';
import { TokenBucket, type TokenBucketOptions } from './token-bucket.js';
import { retry, type RetryOptions } from './retry.js';

export type RateLimiterOptions = {
  /** Max in-flight. Default 1 (serial). */
  concurrency?: number;
  /** Token-bucket throttling. Omit to disable. */
  bucket?: TokenBucketOptions;
  /** Circuit breaker. Omit to disable. */
  breaker?: CircuitBreakerOptions;
  /** Retry config. Omit to disable retries. */
  retry?: RetryOptions;
  /** Tokens per call (default 1). */
  costPerCall?: number;
};

export class RateLimiter {
  private readonly gate: ConcurrencyGate;
  private readonly bucket?: TokenBucket;
  private readonly breaker?: CircuitBreaker;
  private readonly retry?: RetryOptions;
  private readonly cost: number;

  constructor(opts: RateLimiterOptions = {}) {
    this.gate = new ConcurrencyGate(opts.concurrency ?? 1);
    if (opts.bucket) this.bucket = new TokenBucket(opts.bucket);
    if (opts.breaker) this.breaker = new CircuitBreaker(opts.breaker);
    if (opts.retry) this.retry = opts.retry;
    this.cost = opts.costPerCall ?? 1;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.gate.run(async () => {
      if (this.bucket) await this.bucket.acquire(this.cost);
      const core = () => (this.breaker ? this.breaker.exec(fn) : fn());
      return this.retry
        ? retry(core, {
            ...this.retry,
            // Never retry a synthetic "circuit open" — let it bubble up fast.
            shouldRetry: (err, attempt) => {
              if (err instanceof CircuitOpenError) return false;
              return this.retry!.shouldRetry ? this.retry!.shouldRetry(err, attempt) : true;
            },
          })
        : core();
    });
  }

  inFlight(): number { return this.gate.inFlight(); }
  queueDepth(): number { return this.gate.queueDepth(); }
}
