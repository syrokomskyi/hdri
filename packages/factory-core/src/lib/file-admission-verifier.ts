/*
<MODULE_CONTRACT>
<purpose>Bind RFC-0113 admission references to bounded local bytes, pinned keys and authenticated scope.</purpose>
<non-goals>
  <item>Does not discover roots or keys from caller-controlled admission JSON.</item>
  <item>Does not grant authority to fixture evidence when an operational scope is requested.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0113: implement production AdmissionVerificationDeps for signed evidence files.</item>
  <item>Verify referenced domain bytes and require role-specific validation for operational effects.</item>
  <item>Require the operational trust manifest bytes to match a deployment-pinned SHA-256.</item>
</CHANGE_SUMMARY>
*/

import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import {
  assertCanonicalFilePath,
  readBoundedFile,
} from "@warpgogol/pipeline-node";
import {
  parseAdmissionEvidenceManifest,
  verifyAdmissionEvidenceSignature,
  type AdmissionEvidenceManifest,
} from "@syrokomskyi/observatory-crypto";
import type {
  AdmissionVerificationDeps,
  EvidenceRef,
  EvidenceScope,
  EvidenceVerificationResult,
} from "./admission-input.js";
import { parseAdmissionInput, verifyAdmissionInput } from "./admission-input.js";

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export type AdmissionTrustKey = Readonly<{
  signingKeyId: string;
  publicKeyPem: string;
  keyClass: "operational" | "fixture";
}>;

export type FileAdmissionVerificationOptions = Readonly<{
  /** Pinned by the entry point/configuration, never read from AdmissionInput. */
  evidenceRoot: string;
  /** Separate operational/fixture keyrings are represented by keyClass. */
  trustedKeys: ReadonlyMap<string, AdmissionTrustKey>;
  maxEvidenceBytes?: number;
  /** Required for operational evidence: verifies the role-specific claim and referenced closure. */
  verifyDomainEvidence?: (
    manifest: AdmissionEvidenceManifest,
    context: Readonly<{
      envelopePath: string;
      evidencePath: string;
      evidenceBytes: Buffer;
    }>,
  ) => Promise<boolean>;
}>;

export type AdmissionFileInputOptions = Readonly<{
  admissionInputPath: string | undefined;
  evidenceRoot: string | undefined;
  trustedKeysPath: string | undefined;
  /** Deployment-pinned digest of the operational trust manifest; never read from admission JSON. */
  trustedKeysSha256?: string;
  expected: Readonly<Pick<EvidenceScope, "period" | "capsuleId" | "operation">>;
  requiredEvidenceClass: EvidenceScope["evidenceClass"];
  verifyDomainEvidence?: FileAdmissionVerificationOptions["verifyDomainEvidence"];
}>;

export function parseAdmissionTrustManifest(value: unknown): ReadonlyMap<string, AdmissionTrustKey> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) throw new Error("INVALID_ADMISSION_TRUST_MANIFEST");
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).sort().join(",") !== "keys,schema" ||
    object.schema !== "hdri-admission-trust@1" ||
    !Array.isArray(object.keys)
  )
    throw new Error("INVALID_ADMISSION_TRUST_MANIFEST");
  const keys = new Map<string, AdmissionTrustKey>();
  for (const item of object.keys) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("INVALID_ADMISSION_TRUST_KEY");
    const key = item as Record<string, unknown>;
    if (
      Object.keys(key).length !== 3 ||
      typeof key.signingKeyId !== "string" ||
      typeof key.publicKeyPem !== "string" ||
      (key.keyClass !== "fixture" && key.keyClass !== "operational") ||
      !key.signingKeyId.trim() ||
      !key.publicKeyPem.includes("PUBLIC KEY")
    ) throw new Error("INVALID_ADMISSION_TRUST_KEY");
    if (keys.has(key.signingKeyId)) throw new Error("DUPLICATE_ADMISSION_TRUST_KEY");
    keys.set(key.signingKeyId, {
      signingKeyId: key.signingKeyId,
      publicKeyPem: key.publicKeyPem,
      keyClass: key.keyClass,
    });
  }
  if (!keys.size) throw new Error("EMPTY_ADMISSION_TRUST_MANIFEST");
  return keys;
}

function equalDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "ascii");
  const rightBytes = Buffer.from(right, "ascii");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sameScope(left: AdmissionEvidenceManifest["scope"], right: EvidenceScope): boolean {
  return (
    left.period === right.period &&
    left.capsuleId === right.capsuleId &&
    left.operation === right.operation &&
    left.implementationFingerprint === right.implementationFingerprint &&
    left.policySha256 === right.policySha256 &&
    left.evidenceClass === right.evidenceClass
  );
}

function containedPath(root: string, uri: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, uri);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`))
    throw new Error("ADMISSION_EVIDENCE_ROOT_ESCAPE");
  return resolved;
}

async function verifyFileEvidence(
  ref: EvidenceRef,
  expected: Readonly<{ role: string; scope: EvidenceScope }>,
  options: FileAdmissionVerificationOptions,
): Promise<EvidenceVerificationResult> {
  const maxBytes = options.maxEvidenceBytes ?? MAX_EVIDENCE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_EVIDENCE_BYTES)
    throw new Error("INVALID_ADMISSION_EVIDENCE_LIMIT");
  await assertCanonicalFilePath(options.evidenceRoot);
  const file = containedPath(options.evidenceRoot, ref.uri);
  await assertCanonicalFilePath(file);
  const bytes = await readBoundedFile(file, maxBytes);
  if (bytes.length !== ref.bytes || !equalDigest(createHash("sha256").update(bytes).digest("hex"), ref.sha256))
    throw new Error("ADMISSION_EVIDENCE_BYTES_MISMATCH");
  const manifest = parseAdmissionEvidenceManifest(bytes.toString("utf8"));
  if (manifest.role !== expected.role || !sameScope(manifest.scope, expected.scope))
    throw new Error("ADMISSION_EVIDENCE_SCOPE_MISMATCH");
  const trusted = options.trustedKeys.get(manifest.signing_key_id);
  if (!trusted || trusted.signingKeyId !== manifest.signing_key_id)
    throw new Error("ADMISSION_EVIDENCE_KEY_UNTRUSTED");
  if (!verifyAdmissionEvidenceSignature(manifest, trusted.publicKeyPem))
    throw new Error("ADMISSION_EVIDENCE_SIGNATURE_INVALID");
  if (trusted.keyClass !== manifest.scope.evidenceClass)
    throw new Error("ADMISSION_EVIDENCE_KEY_CLASS_MISMATCH");
  const evidencePath = containedPath(options.evidenceRoot, manifest.evidence.uri);
  if (evidencePath === file) throw new Error("ADMISSION_EVIDENCE_SELF_REFERENCE");
  await assertCanonicalFilePath(evidencePath);
  const evidenceBytes = await readBoundedFile(evidencePath, maxBytes);
  if (
    evidenceBytes.length !== manifest.evidence.bytes ||
    !equalDigest(
      createHash("sha256").update(evidenceBytes).digest("hex"),
      manifest.evidence.sha256,
    )
  ) throw new Error("ADMISSION_DOMAIN_EVIDENCE_BYTES_MISMATCH");
  if (trusted.keyClass === "operational") {
    if (!options.verifyDomainEvidence) throw new Error("ADMISSION_DOMAIN_VERIFIER_REQUIRED");
    if (
      !(await options.verifyDomainEvidence(manifest, {
        envelopePath: file,
        evidencePath,
        evidenceBytes: Buffer.from(evidenceBytes),
      }))
    )
      throw new Error("ADMISSION_DOMAIN_VERDICT_INVALID");
  }
  return { valid: true, keyClass: trusted.keyClass, scope: manifest.scope };
}

export function createFileAdmissionVerificationDeps(
  options: FileAdmissionVerificationOptions,
): AdmissionVerificationDeps {
  return Object.freeze({
    verifyEvidenceRef: (ref: EvidenceRef, expected: Readonly<{ role: string; scope: EvidenceScope }>) =>
      verifyFileEvidence(ref, expected, options),
    sha256: (data: string) => createHash("sha256").update(data, "utf8").digest("hex"),
  });
}

export async function loadAdmissionInputFromFiles(
  options: AdmissionFileInputOptions,
): Promise<import("./admission-input.js").VerifiedAdmissionInput> {
  if (!options.admissionInputPath || !options.evidenceRoot || !options.trustedKeysPath)
    throw new Error("ADMISSION_INPUT_AND_PINNED_ROOTS_REQUIRED");
  const inputPath = path.resolve(options.admissionInputPath);
  const trustedKeysPath = path.resolve(options.trustedKeysPath);
  await assertCanonicalFilePath(inputPath);
  await assertCanonicalFilePath(trustedKeysPath);
  const input = parseAdmissionInput(
    JSON.parse((await readBoundedFile(inputPath, MAX_EVIDENCE_BYTES)).toString("utf8")),
  );
  if (
    input.scope.period !== options.expected.period ||
    input.scope.capsuleId !== options.expected.capsuleId ||
    input.scope.operation !== options.expected.operation ||
    input.scope.evidenceClass !== options.requiredEvidenceClass
  ) throw new Error("ADMISSION_SCOPE_MISMATCH");
  const trustedKeysBytes = await readBoundedFile(trustedKeysPath, MAX_EVIDENCE_BYTES);
  if (options.requiredEvidenceClass === "operational") {
    if (!options.trustedKeysSha256 || !/^[0-9a-f]{64}$/.test(options.trustedKeysSha256))
      throw new Error("OPERATIONAL_ADMISSION_TRUST_PIN_REQUIRED");
    const actualTrustSha256 = createHash("sha256").update(trustedKeysBytes).digest("hex");
    if (!equalDigest(actualTrustSha256, options.trustedKeysSha256))
      throw new Error("OPERATIONAL_ADMISSION_TRUST_PIN_MISMATCH");
  }
  const trustedKeys = parseAdmissionTrustManifest(
    JSON.parse(trustedKeysBytes.toString("utf8")),
  );
  return verifyAdmissionInput(
    input,
    createFileAdmissionVerificationDeps({
      evidenceRoot: path.resolve(options.evidenceRoot),
      trustedKeys,
      verifyDomainEvidence: options.verifyDomainEvidence,
    }),
  );
}
