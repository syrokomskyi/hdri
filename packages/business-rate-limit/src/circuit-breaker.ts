/**
 * Three-state circuit breaker.
 *
 * CLOSED   — calls pass through; failures are counted in a rolling window.
 *            When failureCount ≥ threshold within windowMs, the breaker opens.
 * OPEN     — calls are rejected fast with CircuitOpenError until cooldownMs
 *            elapses since the trip; then it transitions to HALF_OPEN.
 * HALF_OPEN — the next probe call is allowed through. On success, the breaker
 *            closes. On failure, it opens again and restarts the cooldown.
 *
 * Clock is injectable for deterministic testing.
 */

export type BreakerState = 'closed' | 'open' | 'half-open';

export type CircuitBreakerOptions = {
  /** Failures within window that trip the breaker. Default 5. */
  threshold?: number;
  /** Rolling window size, ms. Default 30_000. */
  windowMs?: number;
  /** Cooldown before half-open probe, ms. Default 10_000. */
  cooldownMs?: number;
  /** Predicate: does this error count as a breaker-failure? Default: every error counts. */
  isFailure?: (err: unknown) => boolean;
  /** Clock injection (for tests). */
  now?: () => number;
  /** Observer callback. */
  onStateChange?: (prev: BreakerState, next: BreakerState) => void;
};

export class CircuitOpenError extends Error {
  constructor() { super('circuit open'); this.name = 'CircuitOpenError'; }
}

export class CircuitBreaker {
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly isFailure: (err: unknown) => boolean;
  private readonly now: () => number;
  private readonly onStateChange?: (prev: BreakerState, next: BreakerState) => void;

  private state: BreakerState = 'closed';
  private failureTimestamps: number[] = [];
  private openedAtMs = 0;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 5;
    this.windowMs = opts.windowMs ?? 30_000;
    this.cooldownMs = opts.cooldownMs ?? 10_000;
    this.isFailure = opts.isFailure ?? (() => true);
    this.now = opts.now ?? (() => Date.now());
    if (opts.onStateChange) this.onStateChange = opts.onStateChange;
  }

  getState(): BreakerState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  private transition(next: BreakerState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.onStateChange?.(prev, next);
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state !== 'open') return;
    if (this.now() - this.openedAtMs >= this.cooldownMs) {
      this.transition('half-open');
    }
  }

  private recordFailure(err: unknown): void {
    if (!this.isFailure(err)) return;
    const now = this.now();
    this.failureTimestamps.push(now);
    // Drop old timestamps outside the rolling window.
    const cutoff = now - this.windowMs;
    while (this.failureTimestamps.length > 0 && this.failureTimestamps[0]! < cutoff) {
      this.failureTimestamps.shift();
    }
    if (this.state === 'half-open') {
      this.openedAtMs = now;
      this.failureTimestamps = []; // reset window on re-open
      this.transition('open');
    } else if (this.state === 'closed' && this.failureTimestamps.length >= this.threshold) {
      this.openedAtMs = now;
      this.failureTimestamps = [];
      this.transition('open');
    }
  }

  private recordSuccess(): void {
    if (this.state === 'half-open') {
      this.failureTimestamps = [];
      this.transition('closed');
    }
  }

  /**
   * Execute `fn` through the breaker.
   * Throws CircuitOpenError immediately when state is open.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();
    if (this.state === 'open') throw new CircuitOpenError();
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }
}
