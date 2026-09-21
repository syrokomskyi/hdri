/*
<MODULE_CONTRACT>
<purpose>This module provides functionality to check the liveness of multiple domains concurrently, allowing for progress tracking and result collection.</purpose>
<non-goals>
  <item>This module does not handle domain validation or error logging beyond liveness checking.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of concurrent domain liveness checking with progress callback support.</item>
</CHANGE_SUMMARY>
*/

import type { BatchCheckOptions, LivenessResult } from "./types.js";
import { checkSiteLiveness } from "./liveness.js";

// ---------------------------------------------------------------------------
// Promise pool helper
// ---------------------------------------------------------------------------

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      if (item !== undefined) {
        await fn(item, i);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks liveness for a list of domains with bounded concurrency.
 *
 * Results are returned in completion order (not input order) via the
 * `onProgress` callback, and also collected into the returned array.
 * The returned array is in input order.
 */
export const checkBatch = async (
  domains: string[],
  options: BatchCheckOptions = {},
): Promise<LivenessResult[]> => {
  const concurrency = options.concurrency ?? 5;
  const results: LivenessResult[] = new Array(domains.length);

  await runWithConcurrency(domains, concurrency, async (domain, i) => {
    const result = await checkSiteLiveness(domain, options);
    results[i] = result;
    options.onProgress?.(result, i, domains.length);
  });

  return results;
};
