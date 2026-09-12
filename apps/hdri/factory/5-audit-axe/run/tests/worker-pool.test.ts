/*
<MODULE_CONTRACT>
<purpose>Unit tests for worker pool helpers (RFC-0105 AC-3: pool config, ADR-0023 recycling policy).</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import {
  computeEnvironmentSha256,
  computePolicySha256,
} from "../browser/worker-pool.js";

describe("worker-pool helpers", () => {
  describe("computeEnvironmentSha256", () => {
    it("produces deterministic 64-char hex", () => {
      const a = computeEnvironmentSha256("browser-digest-1", "4.10.0");
      const b = computeEnvironmentSha256("browser-digest-1", "4.10.0");
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes when browser digest changes", () => {
      const a = computeEnvironmentSha256("digest-a", "4.10.0");
      const b = computeEnvironmentSha256("digest-b", "4.10.0");
      expect(a).not.toBe(b);
    });

    it("changes when engine version changes", () => {
      const a = computeEnvironmentSha256("digest-a", "4.10.0");
      const b = computeEnvironmentSha256("digest-a", "4.11.0");
      expect(a).not.toBe(b);
    });
  });

  describe("computePolicySha256", () => {
    it("produces deterministic 64-char hex", () => {
      const config = {
        poolSize: 4,
        recycleAfterTargets: 20,
        deadlineMs: 120000,
        terminationGraceMs: 5000,
      };
      const a = computePolicySha256(config);
      const b = computePolicySha256(config);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes when poolSize changes", () => {
      const base = {
        poolSize: 4,
        recycleAfterTargets: 20,
        deadlineMs: 120000,
        terminationGraceMs: 5000,
      };
      const a = computePolicySha256(base);
      const b = computePolicySha256({ ...base, poolSize: 8 });
      expect(a).not.toBe(b);
    });

    it("changes when recycleAfterTargets changes", () => {
      const base = {
        poolSize: 4,
        recycleAfterTargets: 20,
        deadlineMs: 120000,
        terminationGraceMs: 5000,
      };
      const a = computePolicySha256(base);
      const b = computePolicySha256({ ...base, recycleAfterTargets: 10 });
      expect(a).not.toBe(b);
    });
  });
});
