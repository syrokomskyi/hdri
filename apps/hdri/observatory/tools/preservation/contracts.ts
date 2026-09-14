/*
<MODULE_CONTRACT>
<purpose>Define preservation diagnostics and baseline import contracts for retained quarterly evidence closure.</purpose>
<non-goals>
  <item>Does not implement file I/O or network operations.</item>
  <item>Does not define pipeline steps or gogol contracts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: preservation and baseline-import contracts.</item>
  <item>Distinguish read-only preservation plans from successfully verified copy operations.</item>
  <item>Validate device-scoped identities and closed receipt shapes without granting evidence authority.</item>
</CHANGE_SUMMARY>
*/

import { assertRelativeObjectPath } from "@warpgogol/pipeline-node";

// ---------------------------------------------------------------------------
// Protected input — file-level inventory entry
// ---------------------------------------------------------------------------

export type AccessClass = "internal" | "restricted" | "public";

export type ProtectedInput = Readonly<{
  absolutePath: string;
  role: string;
  access: AccessClass;
}>;

// ---------------------------------------------------------------------------
// Baseline identity — cross-year asset identity resolution
// ---------------------------------------------------------------------------

export type BaselineIdentity = Readonly<{
  producer: string;
  device: string;
  databaseSha256: string;
  localSiteId: number;
  provisionalId: string;
  canonicalId: string;
  evidenceRefs: readonly string[];
}>;

// ---------------------------------------------------------------------------
// Baseline import receipt — DNA-8 manifest-backed lineage
// ---------------------------------------------------------------------------

export type BaselineImportReceipt = Readonly<{
  schema: "hdri-baseline-import@1";
  period: "2026-q2";
  sourceInventorySha256: string;
  identityMapSha256: string;
  conversionImplementationSha256: string;
  currentBaselineManifestSha256: string;
  unresolvedReferences: number;
  comparisonReportSha256: string;
}>;

// ---------------------------------------------------------------------------
// Preservation diagnostic — app-local JSON output
// ---------------------------------------------------------------------------

export type ViolationCode =
  | "CHANGED_SOURCE_BYTES"
  | "ACTIVE_WRITER"
  | "IDENTITY_AMBIGUITY"
  | "MISSING_EVIDENCE"
  | "INVALID_SIGNATURE"
  | "INSUFFICIENT_CAPACITY"
  | "UNVERIFIED_REPLICA"
  | "LOCK_VIOLATION"
  | "BASELINE_CONVERSION_UNVERIFIED"
  | "PRESERVATION_COMMAND_FAILED";

export type PreservationViolation = Readonly<{
  code: ViolationCode;
  message: string;
  artifactRef: string;
}>;

export type PreservationDiagnostic = Readonly<{
  schema: "hdri-preservation@1";
  operation: "preserve:q2" | "preserve:verify" | "baseline:import";
  status: "pass" | "incomplete" | "planned";
  inputFingerprint: string;
  evidenceRefs: string[];
  violations: PreservationViolation[];
}>;

// ---------------------------------------------------------------------------
// Receipt validator
// ---------------------------------------------------------------------------

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_BASELINE_IDENTITIES = 1_000_000;

function closedObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new Error(`INVALID_BASELINE_INPUT: ${label}`);
  }
  return value as Record<string, unknown>;
}

/** Structural validation only: retained references still need authenticated byte and join verification. */
export function parseBaselineIdentities(value: unknown): readonly BaselineIdentity[] {
  if (!Array.isArray(value) || value.length > MAX_BASELINE_IDENTITIES)
    throw new Error("INVALID_BASELINE_INPUT: identities");
  const seen = new Set<string>();
  const canonicalByProvisional = new Map<string, string>();
  return Object.freeze(
    Array.from(value, (item) => {
      const row = closedObject(
        item,
        [
          "producer",
          "device",
          "databaseSha256",
          "localSiteId",
          "provisionalId",
          "canonicalId",
          "evidenceRefs",
        ],
        "identity",
      );
      for (const field of ["producer", "device", "provisionalId"] as const) {
        const text = row[field];
        if (
          typeof text !== "string" ||
          !text.trim() ||
          text.length > 4096 ||
          /[\u0000-\u001f\u007f]/.test(text)
        )
          throw new Error(`INVALID_BASELINE_INPUT: ${field}`);
      }
      if (typeof row.databaseSha256 !== "string" || !SHA256_HEX.test(row.databaseSha256))
        throw new Error("INVALID_BASELINE_INPUT: databaseSha256");
      if (
        typeof row.localSiteId !== "number" ||
        !Number.isSafeInteger(row.localSiteId) ||
        row.localSiteId < 1
      )
        throw new Error("INVALID_BASELINE_INPUT: localSiteId");
      if (typeof row.canonicalId !== "string" || !UUID.test(row.canonicalId))
        throw new Error("INVALID_BASELINE_INPUT: canonicalId");
      if (
        !Array.isArray(row.evidenceRefs) ||
        row.evidenceRefs.length < 1 ||
        row.evidenceRefs.length > 64
      )
        throw new Error("INVALID_BASELINE_INPUT: evidenceRefs");
      const evidenceRefs = Array.from(row.evidenceRefs, (ref: unknown) => {
        if (typeof ref !== "string" || ref.length > 4096 || /[\u0000-\u001f\u007f]/.test(ref))
          throw new Error("INVALID_BASELINE_INPUT: evidenceRefs");
        assertRelativeObjectPath(ref);
        return ref;
      });
      if (new Set(evidenceRefs).size !== evidenceRefs.length)
        throw new Error("INVALID_BASELINE_INPUT: duplicate evidenceRefs");
      const key = JSON.stringify([row.producer, row.device, row.databaseSha256, row.localSiteId]);
      if (seen.has(key)) throw new Error("IDENTITY_AMBIGUITY: duplicate scoped localSiteId");
      seen.add(key);
      const provisionalKey = JSON.stringify([
        row.producer,
        row.device,
        row.databaseSha256,
        row.provisionalId,
      ]);
      if (
        canonicalByProvisional.has(provisionalKey) &&
        canonicalByProvisional.get(provisionalKey) !== row.canonicalId
      )
        throw new Error("IDENTITY_AMBIGUITY: conflicting scoped provisionalId");
      canonicalByProvisional.set(provisionalKey, row.canonicalId);
      return Object.freeze({
        producer: row.producer as string,
        device: row.device as string,
        databaseSha256: row.databaseSha256,
        localSiteId: row.localSiteId,
        provisionalId: row.provisionalId as string,
        canonicalId: row.canonicalId,
        evidenceRefs: Object.freeze(evidenceRefs),
      });
    }),
  );
}

/** A well-formed receipt is not proof that its referenced evidence exists or is valid. */
export const validateBaselineImportReceipt = (value: unknown): void => {
  const receipt = closedObject(
    value,
    [
      "schema",
      "period",
      "sourceInventorySha256",
      "identityMapSha256",
      "conversionImplementationSha256",
      "currentBaselineManifestSha256",
      "unresolvedReferences",
      "comparisonReportSha256",
    ],
    "receipt",
  );
  if (receipt.schema !== "hdri-baseline-import@1") {
    throw new Error(
      `Invalid receipt schema: expected hdri-baseline-import@1, got ${receipt.schema}`,
    );
  }
  if (receipt.period !== "2026-q2") {
    throw new Error(`Invalid receipt period: expected 2026-q2, got ${receipt.period}`);
  }
  for (const [field, value] of [
    ["sourceInventorySha256", receipt.sourceInventorySha256],
    ["identityMapSha256", receipt.identityMapSha256],
    ["conversionImplementationSha256", receipt.conversionImplementationSha256],
    ["currentBaselineManifestSha256", receipt.currentBaselineManifestSha256],
    ["comparisonReportSha256", receipt.comparisonReportSha256],
  ] as const) {
    if (typeof value !== "string" || !SHA256_HEX.test(value)) {
      throw new Error(`Invalid ${field}: expected 64-char hex SHA-256, got "${value}"`);
    }
  }
  if (
    typeof receipt.unresolvedReferences !== "number" ||
    !Number.isSafeInteger(receipt.unresolvedReferences) ||
    receipt.unresolvedReferences < 0
  ) {
    throw new Error("unresolvedReferences must be a nonnegative safe integer");
  }
};
