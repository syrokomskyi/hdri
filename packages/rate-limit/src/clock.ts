/*
<MODULE_CONTRACT>
<purpose>Defines the unified Clock interface used by all time-dependent modules in the package, along with a default implementation and a sleep helper derived from the clock's setTimeout.</purpose>
<non-goals>
  <item>Does not provide a fake or test clock — see tests/test-clock.ts.</item>
  <item>Does not handle scheduling beyond a single setTimeout per call.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted Clock type from token-bucket.ts; added random() for retry jitter; added sleepFromClock helper.</item>
</CHANGE_SUMMARY>
*/

/**
 * Unified time-injection seam for all time-dependent modules.
 *
 * TokenBucket uses now() + setTimeout().
 * CircuitBreaker uses now().
 * Retry uses setTimeout() (via sleepFromClock) + random().
 *
 * One interface, one test surface.
 */
export type Clock = {
  now: () => number;
  setTimeout: (cb: () => void, ms: number) => { unref?: () => void };
  random: () => number;
};

export const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  random: () => Math.random(),
};

/**
 * Derive a sleep function from a Clock's setTimeout.
 * Allows Retry to stay clock-driven without a separate sleep injection point.
 */
export const sleepFromClock =
  (clock: Clock): ((ms: number) => Promise<void>) =>
  (ms) =>
    new Promise((resolve) => void clock.setTimeout(resolve, ms));
