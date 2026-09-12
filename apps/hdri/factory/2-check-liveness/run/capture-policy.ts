/*
<MODULE_CONTRACT>
<purpose>Preflight checks for HDRI HTTP acquisition (RFC-0103). Egress and collector health logic are in @syrokomskyi/business-crawler.</purpose>
<non-goals>
  <item>This module does not perform HTTP requests or liveness checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of preflight for RFC-0103. Egress and collector health extracted to business-crawler package.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { DEFAULT_EGRESS_POLICY } from "@syrokomskyi/business-crawler";
import type { EgressPolicy } from "@syrokomskyi/business-crawler";

export {
  isAddressBlocked,
  DEFAULT_EGRESS_POLICY,
  createCollectorHealth,
  recordAttempt,
  recordSuccess,
  shouldPause,
} from "@syrokomskyi/business-crawler";

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
