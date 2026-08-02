/*
<MODULE_CONTRACT>
<purpose>Implements a deterministic test clock for manual time control and scheduled callback management.</purpose>
<non-goals>
  <item>Does not interact with real-time clock or system time.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Consolidated makeTestClock() functionality from multiple test files.</item>
</CHANGE_SUMMARY>
*/

import type { Clock } from "../clock.js";

/**
 * Deterministic test clock — records scheduled callbacks and advances manually.
 *
 * Replaces the duplicated makeTestClock() from token-bucket.test.ts
 * and token-bucket.property.test.ts.
 */
export class TestClock implements Clock {
  private nowMs: number;
  private timers: Array<{ at: number; cb: () => void }> = [];
  private rand: () => number;

  constructor(startMs = 1_000_000, rand: () => number = () => 0) {
    this.nowMs = startMs;
    this.rand = rand;
  }

  now(): number {
    return this.nowMs;
  }

  setTimeout(cb: () => void, ms: number): { unref?: () => void } {
    this.timers.push({ at: this.nowMs + ms, cb });
    return { unref: () => {} };
  }

  random(): number {
    return this.rand();
  }

  /** Advance virtual time by ms, firing any due timers in order. */
  advance(ms: number): void {
    const target = this.nowMs + ms;
    this.timers.sort((a, b) => a.at - b.at);
    while (this.timers.length > 0 && this.timers[0]!.at <= target) {
      const t = this.timers.shift()!;
      this.nowMs = t.at;
      t.cb();
      this.timers.sort((a, b) => a.at - b.at);
    }
    this.nowMs = target;
  }

  /** Set the absolute time (useful for circuit-breaker tests that jump time). */
  setNow(ms: number): void {
    this.nowMs = ms;
  }

  get pending(): number {
    return this.timers.length;
  }
}
