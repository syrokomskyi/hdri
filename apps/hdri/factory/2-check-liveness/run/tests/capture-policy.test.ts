import { describe, it, expect } from "vitest";
import {
  isAddressBlocked,
  DEFAULT_EGRESS_POLICY,
  createCollectorHealth,
  recordAttempt,
  recordSuccess,
  shouldPause,
  runPreflight,
  computePolicySha256,
} from "../capture-policy.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("isAddressBlocked (RFC-0103)", () => {
  const policy = DEFAULT_EGRESS_POLICY;

  it("blocks private IPv4 addresses", () => {
    expect(isAddressBlocked("10.0.0.1", policy)).toBe(true);
    expect(isAddressBlocked("172.16.0.1", policy)).toBe(true);
    expect(isAddressBlocked("192.168.1.1", policy)).toBe(true);
  });

  it("blocks loopback addresses", () => {
    expect(isAddressBlocked("127.0.0.1", policy)).toBe(true);
    expect(isAddressBlocked("::1", policy)).toBe(true);
  });

  it("blocks link-local addresses", () => {
    expect(isAddressBlocked("169.254.1.1", policy)).toBe(true);
    expect(isAddressBlocked("fe80::1", policy)).toBe(true);
  });

  it("blocks multicast addresses", () => {
    expect(isAddressBlocked("224.0.0.1", policy)).toBe(true);
    expect(isAddressBlocked("ff02::1", policy)).toBe(true);
  });

  it("blocks reserved addresses", () => {
    expect(isAddressBlocked("0.0.0.0", policy)).toBe(true);
    expect(isAddressBlocked("240.0.0.1", policy)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isAddressBlocked("93.184.216.34", policy)).toBe(false);
    expect(isAddressBlocked("2606:2800:220:1:248:1893:25c8:1946", policy)).toBe(false);
  });
});

describe("CollectorHealth state machine (RFC-0103)", () => {
  it("starts healthy and not paused", () => {
    const h = createCollectorHealth();
    expect(shouldPause(h)).toBe(false);
    expect(h.totalAttempts).toBe(0);
  });

  it("pauses after 2 consecutive sentinel failures", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(false);
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(true);
  });

  it("does not pause on site failures", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "site", isSentinel: true });
    h = recordAttempt(h, { failureOwner: "site", isSentinel: true });
    expect(shouldPause(h)).toBe(false);
  });

  it("resets consecutive sentinel failures on success", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    h = recordAttempt(h, { failureOwner: null, isSentinel: true });
    expect(h.consecutiveSentinelFailures).toBe(0);
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(false);
  });

  it("resumes after 2 consecutive successes", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(true);
    h = recordSuccess(h);
    h = recordSuccess(h);
    expect(shouldPause(h)).toBe(false);
  });
});

describe("runPreflight (RFC-0103)", () => {
  it("passes when storage is available and egress is verified", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-test-"));
    try {
      const result = await runPreflight({
        capsuleDir: tmpDir,
        checkEgress: async () => [],
      });
      expect(result.status).toBe("pass");
      expect(result.violations).toHaveLength(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it("blocks with violation when capsule dir does not exist", async () => {
    const result = await runPreflight({ capsuleDir: "/nonexistent/path/that/does/not/exist" });
    expect(result.status).toBe("blocked");
    expect(result.violations.some((v) => v.code === "storage-check-failed")).toBe(true);
  });

  it("includes egress-not-enforced violation by default", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-test-"));
    try {
      const result = await runPreflight({ capsuleDir: tmpDir });
      expect(result.violations.some((v) => v.code === "egress-not-enforced")).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });
});

describe("computePolicySha256 (RFC-0103)", () => {
  it("produces a stable 64-char hex hash", () => {
    const policy = DEFAULT_EGRESS_POLICY;
    const hash1 = computePolicySha256(policy);
    const hash2 = computePolicySha256(policy);
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different policies", () => {
    const p1 = { ...DEFAULT_EGRESS_POLICY, denyLoopback: true };
    const p2 = { ...DEFAULT_EGRESS_POLICY, denyLoopback: false };
    expect(computePolicySha256(p1)).not.toBe(computePolicySha256(p2));
  });
});
