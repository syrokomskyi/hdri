/*
<MODULE_CONTRACT>
<purpose>Sign and verify the authenticated evidence envelopes consumed by HDRI admission.</purpose>
<non-goals>
  <item>Does not load trust roots or resolve filesystem references.</item>
  <item>Does not decide whether a key is operational or fixture authority.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0113: define a strict canonical Ed25519 evidence envelope for admission.</item>
  <item>Bind each verdict to one exact domain-evidence object by schema, path, size and digest.</item>
</CHANGE_SUMMARY>
*/

import crypto from "node:crypto";
import { canonicalize } from "./canonicalize.js";
import type { SigningKeyConfig } from "./types.js";

const SCHEMA = "hdri-admission-evidence@1" as const;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PERIOD = /^\d{4}-q[1-4]$/;
const ROLES = new Set(["preservation", "qualification", "predecessor", "capacity", "publication"]);
const TOP_LEVEL_FIELDS = [
  "schema",
  "role",
  "scope",
  "evidence",
  "verdict",
  "implementation_fingerprint",
  "policy_sha256",
  "signed_at",
  "signing_key_id",
  "signature",
] as const;

export type AdmissionEvidenceScope = Readonly<{
  period: string;
  capsuleId: string;
  operation: "preserve" | "collect" | "publish";
  implementationFingerprint: string;
  policySha256: string;
  evidenceClass: "fixture" | "operational";
}>;

export type AdmissionEvidenceManifest = Readonly<{
  schema: typeof SCHEMA;
  role: string;
  scope: AdmissionEvidenceScope;
  evidence: AdmissionEvidenceArtifact;
  verdict: "pass";
  implementation_fingerprint: string;
  policy_sha256: string;
  signed_at: string;
  signing_key_id: string;
  signature: string;
}>;

export type AdmissionEvidenceArtifact = Readonly<{
  schema: string;
  uri: string;
  bytes: number;
  sha256: string;
}>;

type Payload = Omit<AdmissionEvidenceManifest, "signature">;

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) throw new Error(`INVALID_ADMISSION_EVIDENCE_${label}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    Buffer.byteLength(value) > 4096 ||
    [...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f)
  ) throw new Error(`INVALID_ADMISSION_EVIDENCE_${label}`);
  return value;
}

function rejectDuplicateJsonMembers(json: string): void {
  const stack: ({ type: "object"; keys: Set<string> } | { type: "array" })[] = [];
  for (let i = 0; i < json.length; i++) {
    const character = json[i];
    if (character === "{") stack.push({ type: "object", keys: new Set() });
    else if (character === "[") stack.push({ type: "array" });
    else if (character === "}" || character === "]") stack.pop();
    else if (character === '"') {
      const start = i;
      for (i++; i < json.length; i++) {
        if (json[i] === "\\") i++;
        else if (json[i] === '"') break;
      }
      let next = i + 1;
      while (/\s/.test(json[next] ?? "")) next++;
      const frame = stack.at(-1);
      if (json[next] === ":" && frame?.type === "object") {
        const key = JSON.parse(json.slice(start, i + 1)) as string;
        if (frame.keys.has(key)) throw new Error("DUPLICATE_ADMISSION_EVIDENCE_FIELD");
        frame.keys.add(key);
      }
    }
  }
}

function parseScope(value: unknown): AdmissionEvidenceScope {
  const scope = exactObject(
    value,
    ["period", "capsuleId", "operation", "implementationFingerprint", "policySha256", "evidenceClass"],
    "SCOPE",
  );
  if (typeof scope.period !== "string" || !PERIOD.test(scope.period))
    throw new Error("INVALID_ADMISSION_EVIDENCE_PERIOD");
  if (typeof scope.operation !== "string" || !["preserve", "collect", "publish"].includes(scope.operation))
    throw new Error("INVALID_ADMISSION_EVIDENCE_OPERATION");
  if (typeof scope.evidenceClass !== "string" || !["fixture", "operational"].includes(scope.evidenceClass))
    throw new Error("INVALID_ADMISSION_EVIDENCE_CLASS");
  if (typeof scope.policySha256 !== "string" || !SHA256.test(scope.policySha256))
    throw new Error("INVALID_ADMISSION_EVIDENCE_POLICY");
  return Object.freeze({
    period: scope.period,
    capsuleId: text(scope.capsuleId, "CAPSULE"),
    operation: scope.operation as AdmissionEvidenceScope["operation"],
    implementationFingerprint: text(scope.implementationFingerprint, "IMPLEMENTATION"),
    policySha256: scope.policySha256,
    evidenceClass: scope.evidenceClass as AdmissionEvidenceScope["evidenceClass"],
  });
}

function parseEvidence(value: unknown): AdmissionEvidenceArtifact {
  const evidence = exactObject(value, ["schema", "uri", "bytes", "sha256"], "ARTIFACT");
  const uri = text(evidence.uri, "ARTIFACT_URI");
  if (
    uri.includes(":") ||
    uri.includes("\\") ||
    uri.split("/").some((part) => !part || part === "." || part === "..")
  ) throw new Error("INVALID_ADMISSION_EVIDENCE_ARTIFACT_URI");
  if (!Number.isSafeInteger(evidence.bytes) || (evidence.bytes as number) <= 0)
    throw new Error("INVALID_ADMISSION_EVIDENCE_ARTIFACT_BYTES");
  if (typeof evidence.sha256 !== "string" || !SHA256.test(evidence.sha256))
    throw new Error("INVALID_ADMISSION_EVIDENCE_ARTIFACT_DIGEST");
  return Object.freeze({
    schema: text(evidence.schema, "ARTIFACT_SCHEMA"),
    uri,
    bytes: evidence.bytes as number,
    sha256: evidence.sha256,
  });
}

export function parseAdmissionEvidenceManifest(json: string): AdmissionEvidenceManifest {
  if (Buffer.byteLength(json) > 4 * 1024 * 1024) throw new Error("ADMISSION_EVIDENCE_SIZE_LIMIT");
  let value: unknown;
  try {
    value = JSON.parse(json);
    rejectDuplicateJsonMembers(json);
  } catch (error) {
    throw new Error("INVALID_ADMISSION_EVIDENCE_JSON", { cause: error });
  }
  const object = exactObject(value, TOP_LEVEL_FIELDS, "SHAPE");
  if (object.schema !== SCHEMA || object.verdict !== "pass" || !ROLES.has(String(object.role)))
    throw new Error("UNSUPPORTED_ADMISSION_EVIDENCE");
  const scope = parseScope(object.scope);
  const signedAt = text(object.signed_at, "TIME");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(signedAt) ||
    Number.isNaN(Date.parse(signedAt)) ||
    new Date(signedAt).toISOString() !== signedAt
  ) throw new Error("INVALID_ADMISSION_EVIDENCE_TIME");
  const signature = text(object.signature, "SIGNATURE");
  if (!BASE64URL.test(signature) || Buffer.from(signature, "base64url").length !== 64)
    throw new Error("INVALID_ADMISSION_EVIDENCE_SIGNATURE");
  const implementationFingerprint = text(object.implementation_fingerprint, "IMPLEMENTATION");
  if (implementationFingerprint !== scope.implementationFingerprint || object.policy_sha256 !== scope.policySha256)
    throw new Error("ADMISSION_EVIDENCE_SCOPE_DUPLICATION_MISMATCH");
  return Object.freeze({
    schema: SCHEMA,
    role: object.role as string,
    scope,
    evidence: parseEvidence(object.evidence),
    verdict: "pass",
    implementation_fingerprint: implementationFingerprint,
    policy_sha256: scope.policySha256,
    signed_at: signedAt,
    signing_key_id: text(object.signing_key_id, "KEY_ID"),
    signature,
  });
}

function payloadOf(manifest: AdmissionEvidenceManifest): Payload {
  const { signature: _signature, ...payload } = manifest;
  return payload;
}

export function admissionEvidencePayload(manifest: AdmissionEvidenceManifest): string {
  return canonicalize(payloadOf(manifest));
}

export function signAdmissionEvidence(args: {
  signingKey: SigningKeyConfig;
  role: string;
  scope: AdmissionEvidenceScope;
  evidence: AdmissionEvidenceArtifact;
  signedAt?: string;
}): AdmissionEvidenceManifest {
  if (!ROLES.has(args.role)) throw new Error("INVALID_ADMISSION_EVIDENCE_ROLE");
  const payload: Payload = {
    schema: SCHEMA,
    role: args.role,
    scope: Object.freeze({ ...args.scope }),
    evidence: Object.freeze({ ...args.evidence }),
    verdict: "pass",
    implementation_fingerprint: args.scope.implementationFingerprint,
    policy_sha256: args.scope.policySha256,
    signed_at: args.signedAt ?? new Date().toISOString(),
    signing_key_id: args.signingKey.signingKeyId,
  };
  const signature = crypto
    .sign(null, Buffer.from(canonicalize(payload), "utf8"), crypto.createPrivateKey(args.signingKey.privateKeyPem))
    .toString("base64url");
  return parseAdmissionEvidenceManifest(canonicalize({ ...payload, signature }));
}

export function verifyAdmissionEvidenceSignature(
  manifest: AdmissionEvidenceManifest,
  publicKeyPem: string,
): boolean {
  return crypto.verify(
    null,
    Buffer.from(admissionEvidencePayload(manifest), "utf8"),
    crypto.createPublicKey(publicKeyPem),
    Buffer.from(manifest.signature, "base64url"),
  );
}
