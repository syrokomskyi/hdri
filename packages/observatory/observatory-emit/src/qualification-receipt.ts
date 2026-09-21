/*
<MODULE_CONTRACT>
<purpose>Validates qualification receipt structure, mandatory stage coverage, measured values and reference resource limits.</purpose>
<non-goals>
  <item>Does not implement the qualification harness or fault injection.</item>
  <item>Does not measure resource usage — that is the harness's responsibility.</item>
  <item>Does not authenticate execution evidence or authorize operational admission from receipt shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0111: QualificationReceipt contract, reference-profile limits, and validator.</item>
  <item>RFC-0115 review: reject malformed input, absent stages, invalid measurements and negative producer outcomes independently.</item>
</CHANGE_SUMMARY>
*/

/**
 * Reference-profile limits for the proposed 8 vCPU / 32 GiB RAM runner.
 * These are proposed limits, not claims about current hardware.
 * Admission on another profile requires its own signed qualification.
 */
export const REFERENCE_PROFILE_LIMITS = {
  coordinatorRssBytes: 2 * 1024 * 1024 * 1024, // 2 GiB
  processTreeRssBytes: 12 * 1024 * 1024 * 1024, // 12 GiB
  maxBrowserWorkers: 4,
  maxDurationMs: 12 * 60 * 60 * 1000, // 12h
} as const;

export const QUALIFICATION_STAGES = [
  "source-admission",
  "frame-identity",
  "liveness",
  "homepage-capture",
  "detected-capture",
  "extraction",
  "browser-audit",
  "translation",
  "scoring",
  "scientific-check",
  "privacy-check",
  "replication",
  "independent-rebuild",
] as const;

const SHA256 = /^[0-9a-f]{64}$/;
const TARGET_COUNTS = [1000, 10_000, 50_000, 200_000];

/**
 * Qualification receipt produced by the quarter:rehearse harness.
 * Binds each qualification run to the exact code and policy version
 * that produced the artifacts, ensuring DNA-8 lineage remains verifiable
 * even after interruption and restart.
 */
export interface QualificationReceipt {
  schema: "hdri-qualification@1";
  implementationFingerprint: string;
  policySha256: string;
  fixtureManifestSha256: string;
  targets: number;
  productionStages: string[];
  peakCoordinatorRssBytes: number;
  peakProcessTreeRssBytes: number;
  peakInodes: number;
  diskBytes: number;
  durationMs: number;
  resumeEquivalenceSha256: string;
  violations: string[];
  status: "pass" | "fail";
}

/**
 * Violation codes returned by validateQualificationReceipt.
 */
export const VIOLATION_CODES = {
  COORDINATOR_RSS_EXCEEDED: "COORDINATOR_RSS_EXCEEDED",
  PROCESS_TREE_RSS_EXCEEDED: "PROCESS_TREE_RSS_EXCEEDED",
  BROWSER_WORKERS_EXCEEDED: "BROWSER_WORKERS_EXCEEDED",
  DURATION_EXCEEDED: "DURATION_EXCEEDED",
  LEAKED_WORKER: "LEAKED_WORKER",
  UNEXPLAINED_KEY_MISMATCH: "UNEXPLAINED_KEY_MISMATCH",
  CHANGED_COMPLETED_EVIDENCE: "CHANGED_COMPLETED_EVIDENCE",
  PARTIAL_RELEASE: "PARTIAL_RELEASE",
  FORBIDDEN_INPUT_READ: "FORBIDDEN_INPUT_READ",
  RESOURCE_EXCESS: "RESOURCE_EXCESS",
  INVALID_SCHEMA: "INVALID_SCHEMA",
  INVALID_STATUS: "INVALID_STATUS",
} as const;

/**
 * Validates a QualificationReceipt against the reference-profile limits.
 * Returns structural violations. Empty means structurally valid, not operationally qualified.
 *
 * A synthetic receipt can test its validator but cannot satisfy the real
 * capacity gate. Lack of a provisioned large runner is an explicit
 * operational blocker, not permission to mark 200k qualified.
 */
// @ai-invariant: Producer-supplied status and violations never substitute for independent validation.
export function validateQualificationReceipt(input: unknown): string[] {
  const violations: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [VIOLATION_CODES.INVALID_SCHEMA];
  }
  const receipt = input as Record<string, unknown>;
  if (receipt.schema !== "hdri-qualification@1") {
    violations.push(VIOLATION_CODES.INVALID_SCHEMA);
    return violations;
  }

  if (receipt.status !== "pass" && receipt.status !== "fail") {
    violations.push(VIOLATION_CODES.INVALID_STATUS);
  }
  if (receipt.status === "fail") violations.push("QUALIFICATION_FAILED");

  for (const field of [
    "implementationFingerprint",
    "policySha256",
    "fixtureManifestSha256",
    "resumeEquivalenceSha256",
  ]) {
    if (typeof receipt[field] !== "string" || !SHA256.test(receipt[field])) {
      violations.push(`INVALID_DIGEST:${field}`);
    }
  }
  if (typeof receipt.targets !== "number" || !TARGET_COUNTS.includes(receipt.targets)) {
    violations.push("INVALID_TARGET_COUNT");
  }

  const stages = new Set<string>();
  if (!Array.isArray(receipt.productionStages)) {
    violations.push("INVALID_STAGES");
  } else {
    for (const stage of receipt.productionStages) {
      if (typeof stage !== "string") {
        violations.push("INVALID_STAGES");
        continue;
      }
      if (stages.has(stage)) violations.push(`DUPLICATE_STAGE:${stage}`);
      if (!(QUALIFICATION_STAGES as readonly string[]).includes(stage))
        violations.push(`UNKNOWN_STAGE:${stage}`);
      stages.add(stage);
    }
  }
  for (const stage of QUALIFICATION_STAGES) {
    if (!stages.has(stage)) violations.push(`MISSING_STAGE_PROOF:${stage}`);
  }

  for (const field of [
    "peakCoordinatorRssBytes",
    "peakProcessTreeRssBytes",
    "peakInodes",
    "diskBytes",
    "durationMs",
  ]) {
    const value = receipt[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      violations.push(`INVALID_MEASUREMENT:${field}`);
    }
  }
  if (
    typeof receipt.peakCoordinatorRssBytes === "number" &&
    typeof receipt.peakProcessTreeRssBytes === "number" &&
    receipt.peakProcessTreeRssBytes < receipt.peakCoordinatorRssBytes
  ) {
    violations.push("INVALID_PROCESS_TREE_MEASUREMENT");
  }

  if (
    typeof receipt.peakCoordinatorRssBytes === "number" &&
    receipt.peakCoordinatorRssBytes > REFERENCE_PROFILE_LIMITS.coordinatorRssBytes
  ) {
    violations.push(VIOLATION_CODES.COORDINATOR_RSS_EXCEEDED);
  }

  if (
    typeof receipt.peakProcessTreeRssBytes === "number" &&
    receipt.peakProcessTreeRssBytes > REFERENCE_PROFILE_LIMITS.processTreeRssBytes
  ) {
    violations.push(VIOLATION_CODES.PROCESS_TREE_RSS_EXCEEDED);
  }

  if (
    typeof receipt.durationMs === "number" &&
    receipt.durationMs > REFERENCE_PROFILE_LIMITS.maxDurationMs
  ) {
    violations.push(VIOLATION_CODES.DURATION_EXCEEDED);
  }

  // If the receipt itself reports violations, include them
  if (!Array.isArray(receipt.violations)) {
    violations.push("INVALID_VIOLATIONS");
  } else {
    for (const v of receipt.violations) {
      if (typeof v !== "string" || v.length === 0) {
        violations.push("INVALID_VIOLATIONS");
      } else if (!violations.includes(v)) {
        violations.push(v);
      }
    }
  }

  return [...new Set(violations)];
}

/**
 * Factory for creating a QualificationReceipt with the correct schema stamp.
 */
export function createQualificationReceipt(
  params: Omit<QualificationReceipt, "schema">,
): QualificationReceipt {
  return {
    schema: "hdri-qualification@1",
    ...params,
  };
}
