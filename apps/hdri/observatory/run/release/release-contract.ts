/*
<MODULE_CONTRACT>
<purpose>Defines fail-closed scientific, rebuild, replica and release envelope evidence required before an HDRI quarter can be published.</purpose>
<non-goals><item>Does not collect sites, calculate scores or waive a failed gate.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>RFC-0107: add ScientificInputs, ProductVerdict, ScientificReport typed contracts and product verdict suppression.</item>
  <item>RFC-0108: add PublicProductRef, DisclosureReport, PUBLIC_PRODUCT_SCHEMAS typed contracts for private/public mart separation.</item>
  <item>RFC-0109: add ReleaseEnvelope, ReleaseInput, PublicationAttestation, new ReplicaReceipt schema. Remove validateReleaseEvidence and N+8+3 arithmetic. Add acyclic closure verification, resumable copy, independence validation, and attestation delivery.</item>
  <item>RFC-0110: replace RebuildReceipt with hdri-independent-rebuild@1 schema. Add RebuildInput, computeInputClosureSha256, createRebuildReceipt, verifyRebuildReceipt.</item>
  <item>RFC-0115: select applicable scientific reports, including the retained operator-approved Q3 classification exception; preserve every other gate.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { CapsuleArtifact, EvidenceRef, QuarterCapsule } from "@syrokomskyi/factory-core";
import { readCapsuleInventoryPart, type CapsuleInventoryPart } from "@syrokomskyi/factory-core";
import { hasRetainedClassificationDecision } from "./classification-release-decision";

export const SCIENTIFIC_REPORTS = {
  "q2-restore.json": {
    reportType: "q2-restore",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/q2-restore.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyQ2RestoreReport",
    affectedProducts: ["cross-section", "panel", "availability", "post-stratified"] as const,
  },
  "source-qc.json": {
    reportType: "source-qc",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/source-qc.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifySourceQcReport",
    affectedProducts: ["cross-section", "panel", "availability"] as const,
  },
  "classification-qc.json": {
    reportType: "classification-qc",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/classification-qc.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyClassificationQcReport",
    affectedProducts: ["cross-section", "post-stratified"] as const,
  },
  "comparability.json": {
    reportType: "comparability",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/methodology-compare.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyComparabilityReport",
    affectedProducts: ["panel"] as const,
  },
  "availability.json": {
    reportType: "availability",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/availability-report.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyAvailabilityReport",
    affectedProducts: ["availability"] as const,
  },
  "privacy-disclosure.json": {
    reportType: "privacy-disclosure",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/privacy-review.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyPrivacyDisclosureReport",
    affectedProducts: ["cross-section", "panel", "availability", "post-stratified"] as const,
  },
  "methodology-snapshot.json": {
    reportType: "methodology-snapshot",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/methodology-snapshot.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyMethodologySnapshotReport",
    affectedProducts: ["methodology"] as const,
  },
  "reconciliation.json": {
    reportType: "reconciliation",
    schema: "hdri-scientific-report@1",
    producer: "scientific-reports/reconcile-counts.ts",
    inputSchema: "hdri-scientific-inputs@1",
    validator: "verifyReconciliationReport",
    affectedProducts: ["cross-section", "panel", "availability", "post-stratified"] as const,
  },
} as const;

export type ScientificReportType =
  (typeof SCIENTIFIC_REPORTS)[keyof typeof SCIENTIFIC_REPORTS]["reportType"];

export type ScientificReportEntry = (typeof SCIENTIFIC_REPORTS)[keyof typeof SCIENTIFIC_REPORTS];

export type ScientificProduct = "cross-section" | "panel" | "availability" | "post-stratified";
export const SCIENTIFIC_PRODUCTS: readonly ScientificProduct[] = ["cross-section", "panel", "availability", "post-stratified"];

export function requiredScientificReports(products: readonly ScientificProduct[] = SCIENTIFIC_PRODUCTS) {
  if (products.length === 0 || new Set(products).size !== products.length ||
    products.some(product => !SCIENTIFIC_PRODUCTS.includes(product)))
    throw new Error("SCIENTIFIC_PRODUCT_SCOPE_INVALID");
  return Object.entries(SCIENTIFIC_REPORTS).filter(([, entry]) =>
    (entry.affectedProducts as readonly string[]).includes("methodology") ||
    products.some(product => (entry.affectedProducts as readonly string[]).includes(product)));
}

/** Only a retained, quarter-bound operator decision can remove the classification sample requirement. */
export async function requiredRetainedScientificReports(
  capsuleDir: string, capsule: Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts">, products: readonly ScientificProduct[],
) {
  const reports = requiredScientificReports(products);
  if (!await hasRetainedClassificationDecision(capsuleDir, capsule, products)) return reports;
  return reports.filter(([filename]) => filename !== "classification-qc.json");
}

export interface ScientificInputs {
  schema: "hdri-scientific-inputs@1";
  capsuleManifestSha256: string;
  sourceAdmissionRef: string;
  frameRef: string;
  observationManifestRef: string;
  scoresRef: string;
  methodologyRef: string;
  classificationPlanRef: string;
  classificationLabelsRef: string | null;
  populationFrameRef: string | null;
}

export interface ProductVerdict {
  product: PublicProductType;
  status: "eligible" | "suppressed";
  reasons: string[];
}

export interface ScientificReport {
  schema: "hdri-scientific-report@1";
  reportType: string;
  inputFingerprint: string;
  status: "pass" | "fail";
  violations: string[];
  productVerdicts: ProductVerdict[];
  evidenceRefs: string[];
}

export type PublicProductType =
  "cross-section" | "panel" | "availability" | "post-stratified" | "methodology";

export interface PublicProductRef {
  schema: "hdri-public-product@1";
  product: PublicProductType;
  format: "csv" | "json";
  contentSha256: string;
  bytes: number;
  policySha256: string;
  schemaId: string;
  sourceAggregateSha256: string;
}

export interface DisclosureReport {
  schema: "hdri-disclosure-report@1";
  publicManifestSha256: string;
  filesChecked: number;
  cellsChecked: number;
  effectiveK: number;
  status: "pass" | "fail";
  violations: string[];
}

// --- RFC-0115: Executed stage and operational proof contracts ---

export interface ExecutedStageProof {
  stage: string;
  inputFingerprint: string;
  inputRefs: readonly EvidenceRef[];
  outputRefs: readonly EvidenceRef[];
  executionRef: EvidenceRef;
  verificationRef: EvidenceRef;
}

export interface OperationalProof {
  schema: "hdri-operational-proof@1";
  kind: "qualification" | "restore" | "custody";
  implementationFingerprint: string;
  policySha256: string;
  runnerProfileRef: EvidenceRef;
  fixtureManifestRef: EvidenceRef | null;
  stages: readonly ExecutedStageProof[];
  measurementsRef: EvidenceRef;
  status: "pass" | "fail";
  signingKeyId: string;
}

export const PUBLIC_PRODUCT_SCHEMAS: Record<
  PublicProductType,
  { allowedFields: readonly string[]; prohibitedFields: readonly string[] }
> = {
  "cross-section": {
    allowedFields: [
      "axis",
      "axis_value",
      "stat_type",
      "dimension_id",
      "n",
      "mean",
      "p10",
      "p25",
      "p50",
      "p75",
      "p90",
      "min_val",
      "max_val",
    ],
    prohibitedFields: ["asset_id", "domain", "url", "email", "phone", "remediation", "score"],
  },
  panel: {
    allowedFields: ["period", "dimension_id", "n", "mean", "delta", "reliable"],
    prohibitedFields: ["asset_id", "domain", "url", "email", "phone", "remediation", "score"],
  },
  availability: {
    allowedFields: ["period", "n", "available", "unavailable", "rate"],
    prohibitedFields: ["asset_id", "domain", "url", "email", "phone", "remediation", "score"],
  },
  "post-stratified": {
    allowedFields: ["strata_code", "bundesland", "n", "weighted_mean", "weighted_n"],
    prohibitedFields: ["asset_id", "domain", "url", "email", "phone", "remediation", "score"],
  },
  methodology: {
    allowedFields: [
      "codebook_version",
      "ontology_version",
      "codebook_sha256",
      "ontology_sha256",
      "canonical_hash",
    ],
    prohibitedFields: ["asset_id", "domain", "url", "email", "phone", "remediation", "score"],
  },
};

export type ScientificGateReport = Readonly<{
  schemaVersion: "1";
  reportType: ScientificReportType;
  period: string;
  capsuleId: string;
  inputFingerprint: string;
  status: "pass" | "fail";
  checkedAt: string;
  violations: readonly string[];
  warnings: readonly string[];
  hardSuppressions: readonly string[];
}> &
  Readonly<Record<string, unknown>>;

export type RebuildReceipt = Readonly<{
  schema: "hdri-independent-rebuild@1" | "hdri-availability-rebuild@1";
  verificationMode?: "retained-offline-data-replay-with-current-descriptor-reconstruction";
  capsuleManifestSha256: string;
  methodologySha256: string;
  runtimeClosureSha256: string;
  rebuiltPublicManifestSha256: string;
  expectedPublicManifestSha256: string;
  inputClosureSha256: string;
  comparisonReportSha256: string;
  isolationProofSha256: string;
  startedAt: string;
  completedAt: string;
}>;

export interface RebuildInput {
  schema: "hdri-rebuild-input@1";
  capsuleManifestPath: string;
  vaultDir: string;
  codebookPath: string;
  ontologyPath: string;
  signalMapPath: string | null;
  methodologyPath: string;
  runtimeClosurePath: string;
  expectedPublicDigest: string;
  publicManifestPath: string;
}

export type ReplicaReceipt = Readonly<{
  schema: "hdri-replica-receipt@1";
  replicaId: string;
  failureDomain: string;
  mediaId: string;
  credentialBoundary: string;
  envelopeSha256: string;
  closureDigest: string;
  verifiedBytes: number;
  verifiedObjects: number;
  verifiedAt: string;
}>;

export type QuarterValidationReport = Readonly<{
  schemaVersion: "1";
  period: string;
  capsuleId: string;
  envelopeSha256: string;
  status: "pass" | "fail";
  checkedAt: string;
  scientificReports: readonly ScientificReportType[];
  rebuildMatch: boolean;
  replicasVerified: number;
  mediaVerified: number;
  violations: readonly string[];
  warnings: readonly string[];
  hardSuppressions: readonly string[];
}>;

export const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

export const sha256Directory = async (
  root: string,
  ignoredNames: ReadonlySet<string> = new Set(),
): Promise<string> => {
  const rows: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignoredNames.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (entry.isSymbolicLink())
        throw new Error(`Release archive cannot contain symlinks: ${relative}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) rows.push(`${relative}\0${await sha256File(absolute)}`);
    }
  };
  await walk(root);
  return createHash("sha256").update(rows.join("\n")).digest("hex");
};

export const readScientificReports = async (
  evidenceDir: string,
  capsule: Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts" | "releaseProfile">,
  products: readonly ScientificProduct[] = SCIENTIFIC_PRODUCTS,
  capsuleDir?: string,
): Promise<ScientificGateReport[]> => {
  const reports: ScientificGateReport[] = [];
  const required = capsuleDir === undefined ? requiredScientificReports(products)
    : await requiredRetainedScientificReports(capsuleDir, capsule, products);
  for (const [filename, entry] of required) {
    const reportType = entry.reportType;
    const reportBytes = await fs.readFile(path.join(evidenceDir, filename));
    if (capsule.releaseProfile === "availability-only@1") {
      const retained = capsule.artifacts.filter(item => item.uri === `artifacts/qc/release/${filename}`);
      if (retained.length !== 1 || retained[0]!.bytes !== reportBytes.length ||
        retained[0]!.sha256 !== createHash("sha256").update(reportBytes).digest("hex"))
        throw new Error(`Scientific report is not capsule-bound: ${filename}`);
    }
    const report = JSON.parse(reportBytes.toString("utf8")) as ScientificGateReport;
    if (
      report.schemaVersion !== "1" ||
      report.reportType !== reportType ||
      report.period !== capsule.period ||
      report.capsuleId !== capsule.capsuleId ||
      typeof report.inputFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(report.inputFingerprint) ||
      report.status !== "pass" ||
      !Array.isArray(report.violations) ||
      report.violations.length !== 0 ||
      !Array.isArray(report.warnings) ||
      !report.warnings.every((item) => typeof item === "string") ||
      !Array.isArray(report.hardSuppressions) ||
      !report.hardSuppressions.every((item) => typeof item === "string") ||
      !Number.isFinite(Date.parse(report.checkedAt))
    ) {
      throw new Error(`Scientific release report failed: ${filename}`);
    }
    const applicability = (report as ScientificGateReport & { applicability?: unknown }).applicability;
    if (applicability !== undefined && (!Array.isArray(applicability) ||
      applicability.length === 0 || applicability.some(value => !SCIENTIFIC_PRODUCTS.includes(value)) ||
      products.some(product => ((entry.affectedProducts as readonly string[]).includes("methodology") ||
        (entry.affectedProducts as readonly string[]).includes(product)) && !applicability.includes(product))))
      throw new Error(`Scientific report does not cover requested products: ${filename}`);
    reports.push(report);
  }
  return reports;
};

// --- RFC-0109: Release envelope and acyclic evidence contracts ---

export interface ReleaseInput {
  schema: "hdri-release-input@1";
  capsuleManifestPath: string;
  evidenceDir: string;
  publicManifestPath: string;
  rebuildReceiptPath: string;
  replicaConfigPath: string;
  vaultDir: string;
  publicArchiveRoot: string;
}

export interface ReleaseEnvelope {
  schema: "hdri-release-envelope@1" | "hdri-release-envelope@2";
  releaseId: string;
  period: string;
  measurementCapsuleSha256: string;
  scientificInputSha256: string;
  inventory: {
    uri: string;
    sha256: string;
    bytes: number;
    access: "public" | "internal" | "restricted";
    artifactInventory?: CapsuleInventoryPart;
  }[];
  publicManifestSha256: string;
  rebuildReceiptSha256: string;
  keyBundleSha256: string;
}

export type ReleaseState = "prepared" | "scientifically-verified" | "replicated" | "published";

export interface PublicationAttestation {
  schema: "hdri-publication-attestation@1" | "hdri-publication-attestation@2";
  custodyPolicySha256?: string;
  releaseId: string;
  envelopeSha256: string;
  replicaReceiptSha256s: string[];
  attestedAt: string;
  signingKeyId: string;
  signature: string;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

export const computeInputClosureSha256 = async (inputPaths: readonly string[]): Promise<string> => {
  const hashes: string[] = [];
  for (const p of [...inputPaths].sort()) {
    if (p == null) continue;
    try {
      hashes.push(`${p}\0${await sha256File(p)}`);
    } catch {
      // Skip missing optional paths
    }
  }
  return createHash("sha256").update(hashes.join("\n")).digest("hex");
};

export const createRebuildReceipt = (
  capsuleManifestSha256: string,
  methodologySha256: string,
  runtimeClosureSha256: string,
  rebuiltPublicManifestSha256: string,
  expectedPublicManifestSha256: string,
  inputClosureSha256: string,
  comparisonReportSha256: string,
  isolationProofSha256: string,
  startedAt: string,
  completedAt: string,
): RebuildReceipt => ({
  schema: "hdri-independent-rebuild@1",
  capsuleManifestSha256,
  methodologySha256,
  runtimeClosureSha256,
  rebuiltPublicManifestSha256,
  expectedPublicManifestSha256,
  inputClosureSha256,
  comparisonReportSha256,
  isolationProofSha256,
  startedAt,
  completedAt,
});

export const verifyRebuildReceipt = (receipt: RebuildReceipt): string[] => {
  const violations: string[] = [];
  if (receipt.schema !== "hdri-independent-rebuild@1" && receipt.schema !== "hdri-availability-rebuild@1") {
    violations.push("rebuild_receipt_schema_mismatch");
    return violations;
  }
  if (receipt.schema === "hdri-availability-rebuild@1" &&
    receipt.verificationMode !== "retained-offline-data-replay-with-current-descriptor-reconstruction")
    violations.push("rebuild_receipt_verification_mode_invalid");
  if (!SHA256_HEX.test(receipt.capsuleManifestSha256)) {
    violations.push("rebuild_receipt_capsule_manifest_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.methodologySha256)) {
    violations.push("rebuild_receipt_methodology_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.runtimeClosureSha256)) {
    violations.push("rebuild_receipt_runtime_closure_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.rebuiltPublicManifestSha256)) {
    violations.push("rebuild_receipt_rebuilt_public_manifest_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.expectedPublicManifestSha256)) {
    violations.push("rebuild_receipt_expected_public_manifest_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.inputClosureSha256)) {
    violations.push("rebuild_receipt_input_closure_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.comparisonReportSha256)) {
    violations.push("rebuild_receipt_comparison_report_hash_invalid");
  }
  if (!SHA256_HEX.test(receipt.isolationProofSha256)) {
    violations.push("rebuild_receipt_isolation_proof_hash_invalid");
  }
  if (!Number.isFinite(Date.parse(receipt.startedAt))) {
    violations.push("rebuild_receipt_started_at_invalid");
  }
  if (!Number.isFinite(Date.parse(receipt.completedAt))) {
    violations.push("rebuild_receipt_completed_at_invalid");
  }
  if (receipt.rebuiltPublicManifestSha256 !== receipt.expectedPublicManifestSha256) {
    violations.push("rebuild_receipt_public_manifest_digest_mismatch");
  }
  return violations;
};

export const verifyRebuildReceiptBinding = (receipt: RebuildReceipt, capsuleManifestSha256: string,
  publicManifestSha256: string): string[] => {
  const violations = verifyRebuildReceipt(receipt);
  if (receipt.capsuleManifestSha256 !== capsuleManifestSha256)
    violations.push("rebuild_receipt_current_capsule_mismatch");
  if (receipt.expectedPublicManifestSha256 !== publicManifestSha256 || receipt.rebuiltPublicManifestSha256 !== publicManifestSha256)
    violations.push("rebuild_receipt_current_public_manifest_mismatch");
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt))
    violations.push("rebuild_receipt_time_order_invalid");
  return violations;
};

export const computeClosureDigest = (
  inventory: readonly ReleaseEnvelope["inventory"][number][],
): string => {
  const sorted = [...inventory]
    .map((entry) => `${entry.uri}\0${entry.sha256}\0${entry.bytes}`)
    .sort();
  const hash = createHash("sha256");
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) hash.update("\n");
    hash.update(sorted[i]!);
  }
  return hash.digest("hex");
};

export const createReleaseEnvelope = (
  releaseId: string,
  period: string,
  measurementCapsuleSha256: string,
  scientificInputSha256: string,
  inventory: ReleaseEnvelope["inventory"],
  publicManifestSha256: string,
  rebuildReceiptSha256: string,
  keyBundleSha256: string,
): ReleaseEnvelope => ({
  schema: inventory.some((entry) => entry.artifactInventory)
    ? "hdri-release-envelope@2"
    : "hdri-release-envelope@1",
  releaseId,
  period,
  measurementCapsuleSha256,
  scientificInputSha256,
  inventory,
  publicManifestSha256,
  rebuildReceiptSha256,
  keyBundleSha256,
});

export const verifyReleaseEnvelope = (envelope: ReleaseEnvelope): string[] => {
  const violations: string[] = [];
  if (
    envelope.schema !== "hdri-release-envelope@1" &&
    envelope.schema !== "hdri-release-envelope@2"
  ) {
    violations.push("envelope_schema_mismatch");
    return violations;
  }
  if (!SHA256_HEX.test(envelope.measurementCapsuleSha256)) {
    violations.push("envelope_measurement_capsule_hash_invalid");
  }
  if (!SHA256_HEX.test(envelope.scientificInputSha256)) {
    violations.push("envelope_scientific_input_hash_invalid");
  }
  if (!SHA256_HEX.test(envelope.publicManifestSha256)) {
    violations.push("envelope_public_manifest_hash_invalid");
  }
  if (!SHA256_HEX.test(envelope.rebuildReceiptSha256)) {
    violations.push("envelope_rebuild_receipt_hash_invalid");
  }
  if (!SHA256_HEX.test(envelope.keyBundleSha256)) {
    violations.push("envelope_key_bundle_hash_invalid");
  }
  const envelopeHash = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
  for (const entry of envelope.inventory) {
    if (
      entry.artifactInventory &&
      (envelope.schema !== "hdri-release-envelope@2" ||
        entry.access !== "internal" ||
        entry.uri !== entry.artifactInventory.uri ||
        entry.sha256 !== entry.artifactInventory.sha256 ||
        entry.bytes !== entry.artifactInventory.bytes)
    )
      violations.push(`inventory_reference_invalid:${entry.uri}`);
    if (!SHA256_HEX.test(entry.sha256)) {
      violations.push(`inventory_entry_hash_invalid:${entry.uri}`);
    }
    if (entry.sha256 === envelopeHash) {
      violations.push(`inventory_self_referential:${entry.uri}`);
    }
  }
  return violations;
};

export const validateReplicaIndependence = (receipts: readonly ReplicaReceipt[]): string[] => {
  const violations: string[] = [];
  if (receipts.length < 2) {
    violations.push("insufficient_replicas");
    return violations;
  }
  const failureDomains = new Set(receipts.map((r) => r.failureDomain));
  const credentialBoundaries = new Set(receipts.map((r) => r.credentialBoundary));
  if (failureDomains.size < receipts.length) {
    violations.push("shared_failure_domain");
  }
  if (credentialBoundaries.size < receipts.length) {
    violations.push("shared_credential_boundary");
  }
  return violations;
};

export const resumeReplicaCopy = async (
  sourceDir: string,
  destinationDir: string,
  inventory: readonly ReleaseEnvelope["inventory"][number][],
): Promise<{ verifiedBytes: number; verifiedObjects: number; closureDigest: string }> => {
  let verifiedBytes = 0;
  let verifiedObjects = 0;
  async function* expandedInventory() {
    for (const entry of inventory) {
      if (entry.artifactInventory) {
        if (
          entry.access !== "internal" ||
          entry.uri !== entry.artifactInventory.uri ||
          entry.sha256 !== entry.artifactInventory.sha256 ||
          entry.bytes !== entry.artifactInventory.bytes
        )
          throw new Error(`Replica inventory reference mismatch: ${entry.uri}`);
        for (const artifact of await readCapsuleInventoryPart(sourceDir, entry.artifactInventory))
          yield artifact;
      }
      yield entry;
    }
  }
  for await (const entry of expandedInventory()) {
    const source = path.join(sourceDir, entry.uri);
    const destination = path.join(destinationDir, entry.uri);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    // Content-addressed skip: check existing file by sha256
    let existingHash: string | null = null;
    try {
      existingHash = await sha256File(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existingHash !== entry.sha256) {
      await fs.copyFile(source, destination);
    }
    // Read-back verify
    const actualHash = await sha256File(destination);
    if (actualHash !== entry.sha256 || (await fs.stat(destination)).size !== entry.bytes) {
      throw new Error(`Read-back verification failed for ${entry.uri}`);
    }
    verifiedBytes += entry.bytes;
    verifiedObjects += 1;
  }
  return {
    verifiedBytes,
    verifiedObjects,
    closureDigest: computeClosureDigest(inventory),
  };
};

// @ai-invariant: Assembly must retain the exact timestamp included in the signed payload.
export const createPublicationAttestation = (
  envelope: ReleaseEnvelope,
  replicaReceiptSha256s: string[],
  signingKeyId: string,
  signature: string,
  attestedAt: string,
  custodyPolicySha256?: string,
): PublicationAttestation => {
  if (custodyPolicySha256 !== undefined && !SHA256_HEX.test(custodyPolicySha256))
    throw new Error("ATTESTATION_CUSTODY_POLICY_DIGEST_INVALID");
  return {
  schema: custodyPolicySha256 ? "hdri-publication-attestation@2" : "hdri-publication-attestation@1",
  ...(custodyPolicySha256 ? { custodyPolicySha256 } : {}),
  releaseId: envelope.releaseId,
  envelopeSha256: createHash("sha256").update(JSON.stringify(envelope)).digest("hex"),
  replicaReceiptSha256s,
  attestedAt,
  signingKeyId,
  signature,
  };
};

export const verifyAttestationDelivery = async (
  attestation: PublicationAttestation,
  destinationDirs: readonly string[],
): Promise<string[]> => {
  const violations: string[] = [];
  for (const dir of destinationDirs) {
    const attestationPath = path.join(dir, "publication-attestation.json");
    try {
      const bytes = await fs.readFile(attestationPath);
      const expected = Buffer.from(JSON.stringify(attestation, null, 2) + "\n");
      if (!bytes.equals(expected)) {
        violations.push(`attestation_bytes_mismatch:${dir}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        violations.push(`attestation_missing:${dir}`);
      } else {
        throw error;
      }
    }
  }
  return violations;
};

export const artifactForFile = async (
  capsuleDir: string,
  uri: string,
  stage: CapsuleArtifact["stage"] = "qc",
): Promise<CapsuleArtifact> => {
  const absolute = path.join(capsuleDir, uri);
  const stat = await fs.stat(absolute);
  return { stage, uri, sha256: await sha256File(absolute), bytes: stat.size };
};

// --- RFC-0115: Count consistency (not complete complementary-disclosure review) ---

export interface ProductDisclosureEntry {
  product: PublicProductType;
  /** Absent for a product-wide total; present for a particular aggregate cell. */
  cellKey?: string;
  format: "csv" | "json";
  contentSha256: string;
  n: number;
}

export interface ComplementarySuppressionResult {
  status: "pass" | "fail";
  violations: string[];
  crossFormatMismatches: string[];
  crossQuarterAssessment: "not-assessed";
}

// Counts alone cannot establish cross-quarter differencing disclosure. New market
// snapshots may grow or shrink; actual disclosure review remains a separate gate.
export const checkComplementarySuppression = (
  currentProducts: readonly ProductDisclosureEntry[],
  effectiveK: number,
): ComplementarySuppressionResult => {
  const violations: string[] = [];
  const crossFormatMismatches: string[] = [];
  if (!Number.isSafeInteger(effectiveK) || effectiveK < 1)
    throw new Error("DISCLOSURE_K_INVALID");

  const byProduct = new Map<string, ProductDisclosureEntry[]>();
  for (const entry of currentProducts) {
    const key = entry.cellKey === undefined ? entry.product : `${entry.product}:${entry.cellKey}`;
    const list = byProduct.get(key) ?? [];
    list.push(entry);
    byProduct.set(key, list);
  }

  for (const [product, entries] of byProduct) {
    if (entries.length > 1) {
      const ns = new Set(entries.map((e) => e.n));
      if (ns.size > 1) {
        crossFormatMismatches.push(
          `cross_format_n_mismatch:${product}: ${entries.map((e) => `${e.format}=${e.n}`).join(", ")}`,
        );
        violations.push(`complementary_suppression_cross_format:${product}`);
      }
    }
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.n) || entry.n < 0)
        violations.push(`invalid_cell_count:${product}:${entry.format}`);
      if (entry.n < effectiveK) {
        violations.push(`below_k_threshold:${product}:${entry.format}:n=${entry.n}`);
      }
    }
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    violations,
    crossFormatMismatches,
    crossQuarterAssessment: "not-assessed",
  };
};
