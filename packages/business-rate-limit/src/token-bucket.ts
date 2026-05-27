/**
 * Classic token bucket rate limiter with async waiters.
 *
 * Semantics:
 *   - Capacity `size` tokens. Refilled at `refillPerSec` continuously (fractional).
 *   - `acquire(n=1)` returns a Promise that resolves when n tokens are available.
 *   - FIFO fairness: waiters are satisfied in the order they arrived.
 *   - `tryAcquire(n=1)` never waits; returns boolean.
 *
 * The clock is injectable for deterministic testing.
 */

export type Clock = {
  now: () => number;
  setTimeout: (cb: () => void, ms: number) => { unref?: () => void };
};

const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
};

export type TokenBucketOptions = {
  /** Maximum burst size (tokens). */
  size: number;
  /** Refill rate in tokens per second (may be fractional). */
  refillPerSec: number;
  /** Optional clock override for testing. */
  clock?: Clock;
};

type Waiter = {
  n: number;
  resolve: () => void;
};

export class TokenBucket {
  private readonly size: number;
  private readonly refillPerSec: number;
  private readonly clock: Clock;

  private tokens: number;
  private lastRefillMs: number;
  private readonly waiters: Waiter[] = [];
  private pumpScheduled = false;

  constructor(opts: TokenBucketOptions) {
    if (opts.size <= 0) throw new Error('TokenBucket: size must be > 0');
    if (opts.refillPerSec <= 0) throw new Error('TokenBucket: refillPerSec must be > 0');

    this.size = opts.size;
    this.refillPerSec = opts.refillPerSec;
    this.clock = opts.clock ?? defaultClock;
    this.tokens = opts.size;
    this.lastRefillMs = this.clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const dtSec = (now - this.lastRefillMs) / 1000;
    if (dtSec <= 0) return;
    this.tokens = Math.min(this.size, this.tokens + dtSec * this.refillPerSec);
    this.lastRefillMs = now;
  }

  /** Available tokens right now (refilled). */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Non-blocking: consume n tokens if available, else return false. */
  tryAcquire(n = 1): boolean {
    if (n > this.size) throw new Error(`TokenBucket: requested ${n} > capacity ${this.size}`);
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Waits until n tokens are available (FIFO). */
  async acquire(n = 1): Promise<void> {
    if (n > this.size) throw new Error(`TokenBucket: requested ${n} > capacity ${this.size}`);
    // Fast path: no queue and enough tokens → synchronous consume.
    if (this.waiters.length === 0 && this.tryAcquire(n)) return;

    await new Promise<void>((resolve) => {
      this.waiters.push({ n, resolve });
      this.schedulePump();
    });
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    const head = this.waiters[0];
    if (!head) { this.pumpScheduled = false; return; }
    this.refill();
    const need = head.n - this.tokens;
    const waitMs = need <= 0 ? 0 : Math.max(1, Math.ceil((need / this.refillPerSec) * 1000));
    const t = this.clock.setTimeout(() => {
      this.pumpScheduled = false;
      this.pump();
    }, waitMs);
    t.unref?.();
  }

  private pump(): void {
    this.refill();
    while (this.waiters.length > 0) {
      const head = this.waiters[0]!;
      if (this.tokens < head.n) break;
      this.tokens -= head.n;
      this.waiters.shift();
      head.resolve();
    }
    if (this.waiters.length > 0) this.schedulePump();
  }
}
