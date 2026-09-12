/*
<MODULE_CONTRACT>
<purpose>Defines fail-closed scientific, rebuild, replica and release envelope evidence required before an HDRI quarter can be published.</purpose>
<non-goals><item>Does not collect sites, calculate scores or waive a failed gate.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing release-contract module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: add ScientificInputs, ProductVerdict, ScientificReport typed contracts and product verdict suppression.</item>
  <item>RFC-0108: add PublicProductRef, DisclosureReport, PUBLIC_PRODUCT_SCHEMAS typed contracts for private/public mart separation.</item>
  <item>RFC-0109: add ReleaseEnvelope, ReleaseInput, PublicationAttestation, new ReplicaReceipt schema. Remove validateReleaseEvidence and N+8+3 arithmetic. Add acyclic closure verification, resumable copy, independence validation, and attestation delivery.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { CapsuleArtifact, QuarterCapsule } from "@syrokomskyi/factory-core";

export const SCIENTIFIC_REPORTS = {
  "q2-restore.json": { reportType: "q2-restore", schema: "hdri-scientific-report@1" },
  "source-qc.json": { reportType: "source-qc", schema: "hdri-scientific-report@1" },
  "classification-qc.json": { reportType: "classification-qc", schema: "hdri-scientific-report@1" },
  "comparability.json": { reportType: "comparability", schema: "hdri-scientific-report@1" },
  "availability.json": { reportType: "availability", schema: "hdri-scientific-report@1" },
  "privacy-disclosure.json": {
    reportType: "privacy-disclosure",
    schema: "hdri-scientific-report@1",
  },
  "methodology-snapshot.json": {
    reportType: "methodology-snapshot",
    schema: "hdri-scientific-report@1",
  },
  "reconciliation.json": { reportType: "reconciliation", schema: "hdri-scientific-report@1" },
} as const;

export type ScientificReportType =
  (typeof SCIENTIFIC_REPORTS)[keyof typeof SCIENTIFIC_REPORTS]["reportType"];

export type ScientificProduct = "cross-section" | "panel" | "availability" | "post-stratified";

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
  product: ScientificProduct;
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
  schemaVersion: "1";
  period: string;
  capsuleId: string;
  candidateManifestSha256: string;
  primaryPublicArchiveHash: string;
  rebuiltPublicArchiveHash: string;
  preparedEmptyAt: string;
  verifiedAt: string;
  matched: true;
}>;

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
  capsule: QuarterCapsule,
): Promise<ScientificGateReport[]> => {
  const reports: ScientificGateReport[] = [];
  for (const [filename, entry] of Object.entries(SCIENTIFIC_REPORTS)) {
    const reportType = entry.reportType;
    const report = JSON.parse(
      await fs.readFile(path.join(evidenceDir, filename), "utf8"),
    ) as ScientificGateReport;
    if (
      report.schemaVersion !== "1" ||
      report.reportType !== reportType ||
      report.period !== capsule.period ||
      report.capsuleId !== capsule.capsuleId ||
      typeof report.inputFingerprint !== "string" ||
      report.inputFingerprint.length !== 64 ||
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
  schema: "hdri-release-envelope@1";
  releaseId: string;
  period: string;
  measurementCapsuleSha256: string;
  scientificInputSha256: string;
  inventory: {
    uri: string;
    sha256: string;
    bytes: number;
    access: "public" | "internal" | "restricted";
  }[];
  publicManifestSha256: string;
  rebuildReceiptSha256: string;
  keyBundleSha256: string;
}

export type ReleaseState = "prepared" | "scientifically-verified" | "replicated" | "published";

export interface PublicationAttestation {
  schema: "hdri-publication-attestation@1";
  releaseId: string;
  envelopeSha256: string;
  replicaReceiptSha256s: string[];
  attestedAt: string;
  signingKeyId: string;
  signature: string;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

export const computeClosureDigest = (
  inventory: readonly ReleaseEnvelope["inventory"][number][],
): string => {
  const sorted = [...inventory]
    .map((entry) => `${entry.uri}\0${entry.sha256}\0${entry.bytes}`)
    .sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
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
  schema: "hdri-release-envelope@1",
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
  if (envelope.schema !== "hdri-release-envelope@1") {
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
  for (const entry of inventory) {
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
    if (actualHash !== entry.sha256) {
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

export const createPublicationAttestation = (
  envelope: ReleaseEnvelope,
  replicaReceiptSha256s: string[],
  signingKeyId: string,
  signature: string,
): PublicationAttestation => ({
  schema: "hdri-publication-attestation@1",
  releaseId: envelope.releaseId,
  envelopeSha256: createHash("sha256").update(JSON.stringify(envelope)).digest("hex"),
  replicaReceiptSha256s,
  attestedAt: new Date().toISOString(),
  signingKeyId,
  signature,
});

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
