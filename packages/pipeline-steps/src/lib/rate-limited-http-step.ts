/**
 * RateLimitedHttpStep — abstract step with a built-in RateLimiter.
 *
 * Wraps any outbound HTTP (or any async) call with token-bucket throttling,
 * concurrency gating, circuit breaking, and retry with backoff.
 *
 * This base class replaces the per-app pattern of instantiating a
 * RateLimiter in the gogol constructor and calling `rateLimiter.schedule(fn)`
 * for every outbound call. Instead, subclasses call `this.schedule(fn)`.
 *
 * Extracted from Phase 3 (site-profile) and Phase 6 (site-deep-audit)
 * duplicates per AGENTS.md anti-pattern rule.
 *
 * Usage:
 *   class FetchPagesStep extends RateLimitedHttpStep<MyContext> {
 *     protected getRateLimitOptions() {
 *       return {
 *         concurrency: 4,
 *         bucket: { capacity: 10, refillPerSec: 2 },
 *         retry: { maxAttempts: 3 },
 *       };
 *     }
 *     async run(ctx: MyContext): Promise<void> {
 *       for (const url of ctx.state.urls) {
 *         await this.schedule(() => fetch(url));
 *       }
 *     }
 *   }
 */

import { RateLimiter, type RateLimiterOptions } from '@org/business-rate-limit';
import { PipelineStep } from '@org/pipeline-core';
import type { PipelineStepContext } from '@org/pipeline-core';

export abstract class RateLimitedHttpStep<
  TContext extends PipelineStepContext = PipelineStepContext,
> extends PipelineStep<TContext> {
  #limiter: RateLimiter | null = null;

  /**
   * Subclass must return the rate-limit configuration.
   * Called once per step instance — the resulting RateLimiter is cached.
   */
  protected abstract getRateLimitOptions(): RateLimiterOptions;

  /**
   * Run `fn` through the step's RateLimiter.
   * All calls share the same bucket / gate / breaker / retry policy.
   */
  protected async schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.#limiter) {
      this.#limiter = new RateLimiter(this.getRateLimitOptions());
    }
    return this.#limiter.schedule(fn);
  }

  /** Current in-flight call count — useful for logs / metrics. */
  protected inFlight(): number {
    return this.#limiter?.inFlight() ?? 0;
  }

  /** Current queue depth (calls waiting for the gate). */
  protected queueDepth(): number {
    return this.#limiter?.queueDepth() ?? 0;
  }
}
