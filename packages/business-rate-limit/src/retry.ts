/**
 * Retry with exponential backoff and jitter.
 *
 * Defaults: 3 retries, 200ms base, 10s max, full jitter.
 */

export type RetryOptions = {
  /** Max retries (attempts total = retries + 1). */
  retries?: number;
  /** Base delay for exponential backoff, ms. */
  baseDelayMs?: number;
  /** Cap on delay per attempt, ms. */
  maxDelayMs?: number;
  /** Add full random jitter in [0, computedDelay]. */
  jitter?: boolean;
  /** Predicate; return false to abort retrying (default: always retry). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Signal for early cancellation. */
  signal?: AbortSignal;
  /** Random source (for tests). */
  random?: () => number;
  /** Async sleep (for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Observer — called on each failure before retrying. */
  onRetry?: (info: { err: unknown; attempt: number; delayMs: number }) => void;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    super(reason ?? 'aborted');
    this.name = 'AbortedError';
  }
}

/**
 * Run `fn` with retries. Returns the resolved value or throws the last error.
 */
export const retry = async <T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> => {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 200;
  const max = opts.maxDelayMs ?? 10_000;
  const jitter = opts.jitter ?? true;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;
  const rand = opts.random ?? Math.random;

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
