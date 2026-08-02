/*
<MODULE_CONTRACT>
<purpose>Implements a token bucket rate limiter that manages access to resources by controlling token availability.</purpose>
<non-goals>
  <item>Does not provide persistent storage for tokens across application restarts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the token bucket rate limiter with async waiters.</item>
  <item>Extracted Clock type to clock.ts; added onAcquire/onQueue observability callbacks.</item>
  <item>RFC-0003 news: Keep queued production work alive until the promised token is delivered.</item>
</CHANGE_SUMMARY>
*/

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

import { type Clock, defaultClock } from "./clock.js";

export type { Clock };

export type TokenBucketOptions = {
  /** Maximum burst size (tokens). */
  size: number;
  /** Refill rate in tokens per second (may be fractional). */
  refillPerSec: number;
  /** Optional clock override for testing. */
  clock?: Clock;
  /** Observer: called when tokens are consumed (remaining, cost). */
  onAcquire?: (remainingTokens: number, cost: number) => void;
  /** Observer: called when a waiter is queued (waiters count). */
  onQueue?: (waiters: number) => void;
};

type Waiter = {
  n: number;
  resolve: () => void;
};

export class TokenBucket {
  private readonly size: number;
  private readonly refillPerSec: number;
  private readonly clock: Clock;
  private readonly onAcquire?: (remainingTokens: number, cost: number) => void;
  private readonly onQueue?: (waiters: number) => void;

  private tokens: number;
  private lastRefillMs: number;
  private readonly waiters: Waiter[] = [];
  private pumpScheduled = false;

  constructor(opts: TokenBucketOptions) {
    if (opts.size <= 0) throw new Error("TokenBucket: size must be > 0");
    if (opts.refillPerSec <= 0) throw new Error("TokenBucket: refillPerSec must be > 0");

    this.size = opts.size;
    this.refillPerSec = opts.refillPerSec;
    this.clock = opts.clock ?? defaultClock;
    this.onAcquire = opts.onAcquire;
    this.onQueue = opts.onQueue;
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
      this.onAcquire?.(this.tokens, n);
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
      this.onQueue?.(this.waiters.length);
      this.schedulePump();
    });
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    const head = this.waiters[0];
    if (!head) {
      this.pumpScheduled = false;
      return;
    }
    this.refill();
    const need = head.n - this.tokens;
    const waitMs = need <= 0 ? 0 : Math.max(1, Math.ceil((need / this.refillPerSec) * 1000));
    this.clock.setTimeout(() => {
      this.pumpScheduled = false;
      this.pump();
    }, waitMs);
  }

  private pump(): void {
    this.refill();
    while (this.waiters.length > 0) {
      const head = this.waiters[0]!;
      if (this.tokens < head.n) break;
      this.tokens -= head.n;
      this.waiters.shift();
      this.onAcquire?.(this.tokens, head.n);
      head.resolve();
    }
    if (this.waiters.length > 0) this.schedulePump();
  }
}
