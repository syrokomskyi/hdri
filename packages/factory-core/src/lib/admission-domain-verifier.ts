/*
<MODULE_CONTRACT>
<purpose>Role-specific domain verdicts for RFC-0113 admission — verify that the artifact referenced by a signed evidence envelope actually supports the claimed role.</purpose>
<non-goals>
  <item>Does not verify envelope signatures, trust roots or file bytes — file-admission-verifier owns that boundary.</item>
  <item>Does not produce evidence artifacts or decide operational readiness; it only rejects artifacts whose content contradicts the signed claim.</item>
  <item>Does not import app-owned artifact contracts; it re-parses the minimal fields the verdict depends on with closed-shape checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A2: initial per-role domain verifier — predecessor sealed capsule, preservation pass receipt, qualified rehearsal run, capacity report, publication readiness.</item>
</CHANGE_SUMMARY>
*/

import type { AdmissionEvidenceManifest } from "@syrokomskyi/observatory-crypto";
import { computePredecessorPeriod } from "./prior-capsules.js";

const PERIOD = /^\d{4}-q[1-4]$/;
const CAPSULE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Artifact schemas this verifier recognizes per admission role. */
export const ADMISSION_ARTIFACT_SCHEMAS = Object.freeze({
  predecessor: "hdri-quarter-capsule@1",
  preservation: "hdri-preservation@1",
  qualification: "hdri-rehearsal-run@1",
  capacity: "hdri-capacity-report@1",
  publication: "hdri-publication-readiness@1",
} as const);

type DomainContext = Readonly<{
  envelopePath: string;
  evidencePath: string;
  evidenceBytes: Buffer;
}>;

function fail(code: string): never {
  throw new Error(`ADMISSION_DOMAIN_${code}`);
}

function parseArtifact(bytes: Buffer): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ARTIFACT_JSON_INVALID");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail("ARTIFACT_NOT_OBJECT");
  return value as Record<string, unknown>;
}

const SHA256 = /^[0-9a-f]{64}$/i;

/** The signed envelope must declare the role's pinned admission schema. */
function requireDeclaredSchema(manifest: AdmissionEvidenceManifest): string {
  const expected =
    ADMISSION_ARTIFACT_SCHEMAS[manifest.role as keyof typeof ADMISSION_ARTIFACT_SCHEMAS];
  if (!expected) fail("ROLE_UNSUPPORTED");
  if (manifest.evidence.schema !== expected) fail("ARTIFACT_SCHEMA_MISMATCH");
  return expected;
}

/**
 * Formats whose real producers self-declare a schema field must carry the
 * pinned value. The sealed QuarterCapsule manifest is not such a format — its
 * field shape is the contract, so the predecessor verifier checks that shape
 * directly instead of requiring a field the producer never emitted.
 */
function requireArtifactSchema(artifact: Record<string, unknown>, expected: string): void {
  if (artifact.schema !== expected) fail("ARTIFACT_SCHEMA_MISMATCH");
}

function requirePeriod(value: unknown, expected: string): void {
  if (typeof value !== "string" || !PERIOD.test(value) || value !== expected)
    fail("ARTIFACT_PERIOD_MISMATCH");
}

function verifyPredecessor(
  manifest: AdmissionEvidenceManifest,
  artifact: Record<string, unknown>,
): void {
  requireDeclaredSchema(manifest);
  requirePeriod(artifact.period, computePredecessorPeriod(manifest.scope.period));
  if (artifact.state !== "sealed") fail("PREDECESSOR_NOT_SEALED");
  if (typeof artifact.capsuleId !== "string" || !CAPSULE_ID.test(artifact.capsuleId))
    fail("PREDECESSOR_CAPSULE_ID_INVALID");
  if (!Array.isArray(artifact.instrumentPlan)) fail("PREDECESSOR_INSTRUMENT_PLAN_MISSING");
  if (!Array.isArray(artifact.artifacts) || artifact.artifacts.length === 0)
    fail("PREDECESSOR_CLOSURE_EMPTY");
  for (const entry of artifact.artifacts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      fail("PREDECESSOR_ARTIFACT_INVALID");
    const e = entry as Record<string, unknown>;
    if (
      typeof e.stage !== "string" ||
      typeof e.uri !== "string" ||
      typeof e.sha256 !== "string" ||
      !SHA256.test(e.sha256) ||
      !Number.isSafeInteger(e.bytes) ||
      (e.bytes as number) <= 0
    )
      fail("PREDECESSOR_ARTIFACT_INVALID");
  }
}

function verifyPreservation(
  manifest: AdmissionEvidenceManifest,
  artifact: Record<string, unknown>,
): void {
  requireArtifactSchema(artifact, requireDeclaredSchema(manifest));
  if (artifact.operation !== "preserve:verify" && artifact.operation !== "baseline:import")
    fail("PRESERVATION_OPERATION_UNSUPPORTED");
  if (artifact.status !== "pass") fail("PRESERVATION_NOT_PASSING");
  if (!Array.isArray(artifact.violations) || artifact.violations.length !== 0)
    fail("PRESERVATION_VIOLATIONS_PRESENT");
}

function verifyQualification(
  manifest: AdmissionEvidenceManifest,
  artifact: Record<string, unknown>,
): void {
  requireArtifactSchema(artifact, requireDeclaredSchema(manifest));
  if (artifact.status !== "complete") fail("QUALIFICATION_INCOMPLETE");
  // A rehearsal manifest that cannot prove operational qualification must keep
  // blocking admission; never treat signature validity as the measured claim.
  if (artifact.operationallyQualified !== true) fail("QUALIFICATION_NOT_OPERATIONAL");
  const comparison = artifact.comparison;
  if (
    !comparison ||
    typeof comparison !== "object" ||
    Array.isArray(comparison) ||
    (comparison as Record<string, unknown>).match !== true
  )
    fail("QUALIFICATION_COMPARISON_MISSING");
}

function verifyCapacity(
  manifest: AdmissionEvidenceManifest,
  artifact: Record<string, unknown>,
): void {
  requireArtifactSchema(artifact, requireDeclaredSchema(manifest));
  requirePeriod(artifact.period, manifest.scope.period);
  if (artifact.verdict !== "pass") fail("CAPACITY_NOT_PASSING");
  const resources = artifact.resources;
  if (!resources || typeof resources !== "object" || Array.isArray(resources))
    fail("CAPACITY_RESOURCES_MISSING");
  const r = resources as Record<string, unknown>;
  for (const field of ["freeDiskBytes", "availableMemoryBytes", "freeInodes"] as const) {
    if (!Number.isSafeInteger(r[field]) || (r[field] as number) <= 0)
      fail("CAPACITY_RESOURCE_INVALID");
  }
  if (typeof artifact.measuredAt !== "string" || !ISO_TIME.test(artifact.measuredAt))
    fail("CAPACITY_MEASURED_AT_INVALID");
}

function verifyPublication(
  manifest: AdmissionEvidenceManifest,
  artifact: Record<string, unknown>,
): void {
  requireArtifactSchema(artifact, requireDeclaredSchema(manifest));
  requirePeriod(artifact.period, manifest.scope.period);
  if (artifact.capsuleId !== manifest.scope.capsuleId) fail("PUBLICATION_CAPSULE_MISMATCH");
  if (artifact.status !== "ready") fail("PUBLICATION_NOT_READY");
}

const VERIFIERS: Record<
  string,
  (manifest: AdmissionEvidenceManifest, artifact: Record<string, unknown>) => void
> = {
  predecessor: verifyPredecessor,
  preservation: verifyPreservation,
  qualification: verifyQualification,
  capacity: verifyCapacity,
  publication: verifyPublication,
};

/**
 * Domain verdict for one signed admission envelope: the referenced artifact
 * bytes must parse as the role's pinned schema and actually carry the claim.
 * Throws a coded ADMISSION_DOMAIN_* error on any contradiction; returns true
 * only when the artifact content supports the signed verdict.
 */
export const verifyAdmissionDomainEvidence = async (
  manifest: AdmissionEvidenceManifest,
  context: DomainContext,
): Promise<boolean> => {
  const verifier = VERIFIERS[manifest.role];
  if (!verifier) fail("ROLE_UNSUPPORTED");
  verifier(manifest, parseArtifact(context.evidenceBytes));
  return true;
};
