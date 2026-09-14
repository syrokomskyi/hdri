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
</CHANGE_SUMMARY>
*/

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
  databaseSha256: string;
  localSiteId: number;
  provisionalId: string;
  canonicalId: string;
  evidenceRefs: string[];
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

export const validateBaselineImportReceipt = (receipt: BaselineImportReceipt): void => {
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
    if (!SHA256_HEX.test(value)) {
      throw new Error(`Invalid ${field}: expected 64-char hex SHA-256, got "${value}"`);
    }
  }
  if (receipt.unresolvedReferences < 0) {
    throw new Error(`unresolvedReferences must be >= 0, got ${receipt.unresolvedReferences}`);
  }
};
