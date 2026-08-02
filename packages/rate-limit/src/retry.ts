/*
<MODULE_CONTRACT>
<purpose>Implements retry logic with exponential backoff and optional jitter for asynchronous operations.</purpose>
<non-goals>
  <item>Does not handle synchronous operations.</item>
  <item>Does not provide detailed error logging.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of retry functionality with configurable options.</item>
  <item>Added NonRetryableError; accept Clock for sleep/random derivation; default shouldRetry rejects NonRetryableError.</item>
</CHANGE_SUMMARY>
*/

/**
 * Retry with exponential backoff and jitter.
 *
 * Defaults: 3 retries, 200ms base, 10s max, full jitter.
 */

import { type Clock, defaultClock, sleepFromClock } from "./clock.js";

export type RetryOptions = {
  /** Max retries (attempts total = retries + 1). */
  retries?: number;
  /** Base delay for exponential backoff, ms. */
  baseDelayMs?: number;
  /** Cap on delay per attempt, ms. */
  maxDelayMs?: number;
  /** Add full random jitter in [0, computedDelay]. */
  jitter?: boolean;
  /** Predicate; return false to abort retrying (default: always retry except NonRetryableError). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Signal for early cancellation. */
  signal?: AbortSignal;
  /** Clock override (for tests). Derives sleep + random when those are not set. */
  clock?: Clock;
  /** Override sleep (takes precedence over clock-derived sleep). */
  random?: () => number;
  /** Override random (takes precedence over clock-derived random). */
  sleep?: (ms: number) => Promise<void>;
  /** Observer — called on each failure before retrying. */
  onRetry?: (info: { err: unknown; attempt: number; delayMs: number }) => void;
};

export const computeBackoffMs = (
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitter: boolean,
  rand: () => number,
): number => {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return jitter ? Math.floor(rand() * exp) : exp;
};

export class AbortedError extends Error {
  constructor(reason?: string) {
    super(reason ?? "aborted");
    this.name = "AbortedError";
  }
}

/**
 * Wraps an error that must not be retried.
 * The default shouldRetry predicate rejects this.
 */
export class NonRetryableError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = "NonRetryableError";
  }
}

/**
 * Run `fn` with retries. Returns the resolved value or throws the last error.
 */
export const retry = async <T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> => {
  const clock = opts.clock ?? defaultClock;
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 200;
  const max = opts.maxDelayMs ?? 10_000;
  const jitter = opts.jitter ?? true;
  const shouldRetry = opts.shouldRetry ?? ((err) => !(err instanceof NonRetryableError));
  const sleep = opts.sleep ?? sleepFromClock(clock);
  const rand = opts.random ?? clock.random;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new AbortedError();
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      if (!shouldRetry(err, attempt)) break;
      const delay = computeBackoffMs(attempt, base, max, jitter, rand);
      opts.onRetry?.({ err, attempt, delayMs: delay });
      await sleep(delay);
    }
  }
  throw lastErr;
};
