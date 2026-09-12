/*
<MODULE_CONTRACT>
<purpose>Validated capture policy adapter with egress enforcement, collector health state machine, and preflight checks for HDRI HTTP acquisition (RFC-0103).</purpose>
<non-goals>
  <item>This module does not perform HTTP requests or liveness checks.</item>
  <item>This module does not persist collector health state — callers are responsible for journaling transitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of egress policy, collector health, and preflight for RFC-0103.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { EgressPolicy, CollectorHealth } from "@syrokomskyi/business-crawler";

// ---------------------------------------------------------------------------
// Egress policy: address validation
// ---------------------------------------------------------------------------

const PRIVATE_IPV4_RANGES: readonly [number, number][] = [
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
];

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const num = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => num >= lo && num <= hi);
};

const isLoopback = (ip: string): boolean => {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  return ip.startsWith("127.") || ip.startsWith("::ffff:127.");
};

const isLinkLocal = (ip: string): boolean => {
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fe80:")) return true;
  return false;
};

const isMulticast = (ip: string): boolean => {
  if (ip.startsWith("224.") || ip.startsWith("239.")) return true;
  if (ip.startsWith("ff")) return true;
  return false;
};

const isReserved = (ip: string): boolean => {
  if (ip === "0.0.0.0" || ip === "::") return true;
  if (ip.startsWith("0.")) return true;
  if (ip.startsWith("240.") || ip.startsWith("255.")) return true;
  return false;
};

export const isAddressBlocked = (ip: string, policy: EgressPolicy): boolean => {
  if (policy.denyPrivateAddresses && isPrivateIpv4(ip)) return true;
  if (policy.denyLoopback && isLoopback(ip)) return true;
  if (policy.denyLinkLocal && isLinkLocal(ip)) return true;
  if (policy.denyMulticast && isMulticast(ip)) return true;
  if (policy.denyReserved && isReserved(ip)) return true;
  if (policy.includeIpv6 && ip.includes(":")) {
    if (policy.denyLoopback && ip === "::1") return true;
    if (policy.denyLinkLocal && ip.startsWith("fe80:")) return true;
    if (policy.denyMulticast && ip.startsWith("ff")) return true;
  }
  return false;
};

export const DEFAULT_EGRESS_POLICY: EgressPolicy = {
  denyPrivateAddresses: true,
  denyLoopback: true,
  denyLinkLocal: true,
  denyMulticast: true,
  denyReserved: true,
  includeIpv6: true,
};

// ---------------------------------------------------------------------------
// Collector health state machine
// ---------------------------------------------------------------------------

export const createCollectorHealth = (): CollectorHealth => ({
  sentinelFailures: 0,
  consecutiveSentinelFailures: 0,
  totalAttempts: 0,
  collectorOwnedFailures: 0,
  isPaused: false,
});

const PAUSE_SENTINEL_THRESHOLD = 2;
const PAUSE_FAILURE_RATIO = 0.5;
const PAUSE_WINDOW_SIZE = 100;
const RESUME_SUCCESS_THRESHOLD = 2;

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
    const successes = (health as { _resumeSuccesses?: number })._resumeSuccesses ?? 0;
    const newSuccesses = successes + 1;
    if (newSuccesses >= RESUME_SUCCESS_THRESHOLD) {
      next.isPaused = false;
      return { ...next, _resumeSuccesses: undefined } as unknown as CollectorHealth;
    }
    return { ...next, _resumeSuccesses: newSuccesses } as unknown as CollectorHealth;
  }

  return next;
};

export const shouldPause = (health: CollectorHealth): boolean => health.isPaused;

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export type PreflightViolation = {
  code: string;
  message: string;
};

export type PreflightResult = {
  status: "pass" | "blocked";
  violations: PreflightViolation[];
};

const MIN_FREE_DISK_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB

export const runPreflight = async (options: {
  capsuleDir: string;
  egressPolicy?: EgressPolicy;
  checkSentinels?: () => Promise<PreflightViolation[]>;
  checkRuntimeDeps?: () => Promise<PreflightViolation[]>;
  checkClockSanity?: () => Promise<PreflightViolation[]>;
  checkEgress?: () => Promise<PreflightViolation[]>;
}): Promise<PreflightResult> => {
  const violations: PreflightViolation[] = [];

  if (options.checkSentinels) {
    violations.push(...(await options.checkSentinels()));
  }

  if (options.checkRuntimeDeps) {
    violations.push(...(await options.checkRuntimeDeps()));
  }

  if (options.checkClockSanity) {
    violations.push(...(await options.checkClockSanity()));
  }

  const egress = options.egressPolicy ?? DEFAULT_EGRESS_POLICY;
  if (options.checkEgress) {
    violations.push(...(await options.checkEgress()));
  } else if (egress.denyPrivateAddresses || egress.denyLoopback || egress.denyLinkLocal) {
    violations.push({
      code: "egress-not-enforced",
      message: "Egress policy declared but not verified at runtime",
    });
  }

  try {
    const stats = await fs.statfs(options.capsuleDir);
    const freeBytes = stats.bavail * stats.bsize;
    if (freeBytes < MIN_FREE_DISK_BYTES) {
      violations.push({
        code: "insufficient-storage",
        message: `Free disk space ${freeBytes} bytes is below minimum ${MIN_FREE_DISK_BYTES} bytes`,
      });
    }
  } catch {
    violations.push({ code: "storage-check-failed", message: "Unable to verify free disk space" });
  }

  return {
    status: violations.length > 0 ? "blocked" : "pass",
    violations,
  };
};

export const computePolicySha256 = (policy: unknown): string => {
  const canonical = JSON.stringify(policy, Object.keys(policy as object).sort());
  return createHash("sha256").update(canonical).digest("hex");
};
