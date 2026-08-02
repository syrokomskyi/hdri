/*
<MODULE_CONTRACT>
<purpose>Implements a comprehensive rate limiting mechanism combining token bucket, concurrency gate, circuit breaker, and retry strategies to manage API call flow and prevent overload.</purpose>
<non-goals>
  <item>Does not provide detailed logging of rate limiting events.</item>
  <item>Does not handle authentication or authorization of API calls.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the RateLimiter class with integrated strategies.</item>
  <item>Unified Clock injection; wired observability via onEvent; breaker errors wrapped as NonRetryableError.</item>
  <item>RFC-0003 news: Consume a throughput token for every retry attempt, not only the outer scheduled call.</item>
</CHANGE_SUMMARY>
*/

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

import { ConcurrencyGate, type ConcurrencyGateOptions } from "./concurrency-gate.js";
import {
  CircuitBreaker,
  CircuitOpenError,
  type BreakerState,
  type CircuitBreakerOptions,
} from "./circuit-breaker.js";
import { TokenBucket, type TokenBucketOptions } from "./token-bucket.js";
import { retry, NonRetryableError, type RetryOptions } from "./retry.js";
import { type Clock, defaultClock } from "./clock.js";

export type RateLimiterEvent =
  | { type: "gate-acquired"; inFlight: number }
  | { type: "gate-released"; inFlight: number; queueDepth: number }
  | { type: "bucket-acquired"; remainingTokens: number; cost: number }
  | { type: "bucket-queued"; waiters: number }
  | { type: "retry"; attempt: number; delayMs: number; err: unknown }
  | { type: "breaker-state"; prev: BreakerState; next: BreakerState };

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
  /** Shared clock for all sub-modules. */
  clock?: Clock;
  /** Unified event observer — receives events from all sub-modules. */
  onEvent?: (event: RateLimiterEvent) => void;
};

export class RateLimiter {
  private readonly gate: ConcurrencyGate;
  private readonly bucket?: TokenBucket;
  private readonly breaker?: CircuitBreaker;
  private readonly retryOpts?: RetryOptions;
  private readonly cost: number;

  constructor(opts: RateLimiterOptions = {}) {
    const clock = opts.clock ?? defaultClock;
    const onEvent = opts.onEvent;

    const gateOpts: ConcurrencyGateOptions | undefined = onEvent
      ? {
          onAcquire: (inFlight) => onEvent({ type: "gate-acquired", inFlight }),
          onRelease: (inFlight, queueDepth) =>
            onEvent({ type: "gate-released", inFlight, queueDepth }),
        }
      : undefined;

    this.gate = new ConcurrencyGate(opts.concurrency ?? 1, gateOpts);

    if (opts.bucket) {
      this.bucket = new TokenBucket({
        ...opts.bucket,
        clock,
        onAcquire: (remainingTokens, cost) =>
          onEvent?.({ type: "bucket-acquired", remainingTokens, cost }),
        onQueue: (waiters) => onEvent?.({ type: "bucket-queued", waiters }),
      });
    }

    if (opts.breaker) {
      this.breaker = new CircuitBreaker({
        ...opts.breaker,
        clock,
        onStateChange: (prev, next) => onEvent?.({ type: "breaker-state", prev, next }),
      });
    }

    if (opts.retry) {
      this.retryOpts = {
        ...opts.retry,
        clock,
        onRetry: (info) => onEvent?.({ type: "retry", ...info }),
      };
    }

    this.cost = opts.costPerCall ?? 1;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.gate.run(async () => {
      // Breaker errors are wrapped as NonRetryableError so the retry module's
      // default shouldRetry predicate stops retrying without closure capture.
      const core = async () => {
        if (this.bucket) await this.bucket.acquire(this.cost);
        if (!this.breaker) return fn();
        try {
          return await this.breaker.exec(fn);
        } catch (err) {
          if (err instanceof CircuitOpenError) throw new NonRetryableError(err);
          throw err;
        }
      };
      return this.retryOpts ? retry(core, this.retryOpts) : core();
    });
  }

  inFlight(): number {
    return this.gate.inFlight();
  }
  queueDepth(): number {
    return this.gate.queueDepth();
  }
}
