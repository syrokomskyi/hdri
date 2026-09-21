/*
<MODULE_CONTRACT>
<purpose>Collector health state machine for HTTP acquisition pause/resume (RFC-0103).</purpose>
<non-goals>
  <item>This module does not persist collector health state — callers journal transitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from app capture-policy for shared reuse (RFC-0103).</item>
</CHANGE_SUMMARY>
*/

import type { CollectorHealth } from "./types.js";

const PAUSE_SENTINEL_THRESHOLD = 2;
const PAUSE_FAILURE_RATIO = 0.5;
const PAUSE_WINDOW_SIZE = 100;
const RESUME_SUCCESS_THRESHOLD = 2;

export const createCollectorHealth = (): CollectorHealth => ({
  sentinelFailures: 0,
  consecutiveSentinelFailures: 0,
  totalAttempts: 0,
  collectorOwnedFailures: 0,
  isPaused: false,
});

export const recordAttempt = (
  health: CollectorHealth,
  result: { failureOwner: "site" | "collector" | "policy" | null; isSentinel?: boolean },
): CollectorHealth => {
  const next: CollectorHealth = { ...health, totalAttempts: health.totalAttempts + 1 };

  if (result.failureOwner === "collector") {
    next.collectorOwnedFailures += 1;
  }

  if (result.isSentinel && result.failureOwner === "collector") {
    next.sentinelFailures += 1;
    next.consecutiveSentinelFailures += 1;
  } else if (result.isSentinel && result.failureOwner === null) {
    next.consecutiveSentinelFailures = 0;
  }

  const recentFailures = next.consecutiveSentinelFailures >= PAUSE_SENTINEL_THRESHOLD;
  const failureRatio =
    next.totalAttempts > 0
      ? next.collectorOwnedFailures / Math.min(next.totalAttempts, PAUSE_WINDOW_SIZE)
      : 0;
  const highFailureRate = failureRatio >= PAUSE_FAILURE_RATIO && next.totalAttempts >= 10;

  if (!next.isPaused && (recentFailures || highFailureRate)) {
    next.isPaused = true;
  }

  return next;
};

export const recordSuccess = (health: CollectorHealth): CollectorHealth => {
  const next: CollectorHealth = {
    ...health,
    consecutiveSentinelFailures: 0,
  };

  if (next.isPaused) {
    const successes = health._resumeSuccesses ?? 0;
    const newSuccesses = successes + 1;
    if (newSuccesses >= RESUME_SUCCESS_THRESHOLD) {
      next.isPaused = false;
      next._resumeSuccesses = undefined;
      return next;
    }
    next._resumeSuccesses = newSuccesses;
    return next;
  }

  return next;
};

export const shouldPause = (health: CollectorHealth): boolean => health.isPaused;
