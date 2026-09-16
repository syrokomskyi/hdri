/*
<MODULE_CONTRACT>
<purpose>Verify the limited cryptographic provenance retained for declared baseline source files.</purpose>
<non-goals><item>Does not authenticate the supplied key authority or unsigned producer metadata, bind WAL state to a snapshot, validate rows, or grant import admission.</item></non-goals>
<!-- risk: crypto, vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Separate signed original-file claims from unsigned application metadata and unbound SQLite snapshot generations.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: A valid source signature never authenticates app metadata or the prepared snapshot generation.
import path from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { TextDecoder } from "node:util";
import { parseSourceToken, type VerificationKeyMap } from "@syrokomskyi/observatory-crypto";
import { inspectRetainedFile, readBoundedFile } from "@warpgogol/pipeline-node";
import { assertPreparedBaselineSource, type PreparedBaselineSource } from "./preserve.js";
import { assertBaselineScopeInventory, type BaselineScopeInventory } from "./baseline-scope.js";

const MAX_SIGNATURE_BYTES = 64 * 1024;
const MAX_TEXT_BYTES = 4096;
const SHA = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const FIELD_NAMES = [
  "device_id",
  "signing_key_id",
  "source_token",
  "app_id",
  "app_version",
  "content_hash",
  "rows_signed",
  "signed_at",
  "signature",
] as const;
type LegacySourceSignatureManifest = Readonly<{
  device_id: string;
  signing_key_id: string;
  source_token: string;
  app_id: string;
  app_version: string;
  content_hash: string;
  rows_signed: number;
  signed_at: string;
  signature: string;
}>;

type VerifiedClaim = Readonly<{
  status: "signed-token-original-bytes-match-supplied-device-key-snapshot-generation-unbound";
  snapshotUri: string;
  originalUri: string;
  signatureUri: string;
  signingKeyId: string;
  device: string;
  sourceToken: string;
  originalSha256: string;
  unsignedMetadata: Readonly<{
    producer: string;
    appVersion: string;
    rowsSigned: number;
    signedAt: string;
  }>;
}>;
type UnavailableClaim = Readonly<{
  status: "historical-provenance-unavailable";
  snapshotUri: string;
  reason: string;
}>;
export type BaselineProvenanceReport = Readonly<{
  schema: "hdri-baseline-provenance@1";
  manifestSha256: string;
  status: "cryptography-checked-not-admitted";
  keyAuthority: "caller-supplied-not-authenticated";
  signaturesVerifiedAgainstSuppliedKeys: number;
  unavailableClaims: number;
  sources: readonly (VerifiedClaim | UnavailableClaim)[];
}>;

function text(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    Buffer.byteLength(value) > MAX_TEXT_BYTES ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    Buffer.from(value).toString("utf8") !== value
  )
    throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_TEXT");
  return value;
}

/** Valid JSON is scanned independently so overwritten duplicate names cannot disappear in JSON.parse. */
function jsonMemberNames(json: string): string[] {
  const names: string[] = [];
  for (let i = 0; i < json.length; i++) {
    if (json[i] !== '"') continue;
    const start = i;
    for (i++; i < json.length; i++) {
      if (json[i] === "\\") i++;
      else if (json[i] === '"') break;
    }
    if (i >= json.length) throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_JSON");
    let next = i + 1;
    while (/\s/.test(json[next] ?? "")) next++;
    if (json[next] === ":") names.push(JSON.parse(json.slice(start, i + 1)) as string);
  }
  return names;
}

function parseManifest(bytes: Uint8Array): LegacySourceSignatureManifest {
  let json: string;
  let value: unknown;
  try {
    json = utf8.decode(bytes);
    value = JSON.parse(json);
  } catch (error) {
    throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_JSON", { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_SHAPE");
  const object = value as Record<string, unknown>;
  const names = jsonMemberNames(json);
  if (
    Object.getPrototypeOf(object) !== Object.prototype ||
    Object.keys(object).length !== FIELD_NAMES.length ||
    names.length !== FIELD_NAMES.length ||
    new Set(names).size !== FIELD_NAMES.length ||
    FIELD_NAMES.some((name) => !Object.hasOwn(object, name) || !names.includes(name))
  )
    throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_SHAPE");
  const manifest = {
    device_id: text(object.device_id),
    signing_key_id: text(object.signing_key_id),
    source_token: text(object.source_token),
    app_id: text(object.app_id),
    app_version: text(object.app_version),
    content_hash: text(object.content_hash),
    rows_signed: object.rows_signed,
    signed_at: text(object.signed_at),
    signature: text(object.signature),
  };
  if (
    !SHA.test(manifest.content_hash) ||
    !Number.isSafeInteger(manifest.rows_signed) ||
    (manifest.rows_signed as number) < 0 ||
    !BASE64URL.test(manifest.signature) ||
    Buffer.from(manifest.signature, "base64url").length !== 64 ||
    Buffer.from(manifest.signature, "base64url").toString("base64url") !== manifest.signature ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(manifest.signed_at) ||
    Number.isNaN(Date.parse(manifest.signed_at)) ||
    new Date(manifest.signed_at).toISOString() !== manifest.signed_at
  )
    throw new Error("INVALID_BASELINE_SOURCE_SIGNATURE_VALUE");
  return Object.freeze(manifest) as LegacySourceSignatureManifest;
}

function verifyLegacySourceSignature(
  manifest: LegacySourceSignatureManifest,
  publicKeyPem: string,
): boolean {
  const payload = `${manifest.signing_key_id}\n${manifest.source_token}\n${manifest.content_hash}`;
  return verify(
    null,
    Buffer.from(payload, "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(manifest.signature, "base64url"),
  );
}

/** Inspect exactly what the legacy batch signature covered against caller-supplied keys. */
export async function inspectBaselineProvenance(
  prepared: PreparedBaselineSource,
  inventory: BaselineScopeInventory,
  verificationKeys: VerificationKeyMap,
): Promise<BaselineProvenanceReport> {
  assertPreparedBaselineSource(prepared);
  assertBaselineScopeInventory(inventory);
  if (inventory.manifestSha256 !== prepared.manifestSha256)
    throw new Error("BASELINE_PROVENANCE_MANIFEST_MISMATCH");
  const keys = new Map(
    [...verificationKeys].map(([id, key]) => [id, Object.freeze({ ...key })] as const),
  );
  const artifacts = new Map(
    prepared.manifest.artifacts.map((artifact) => [artifact.uri, artifact]),
  );
  const usedSignatures = new Set<string>();
  const sources: (VerifiedClaim | UnavailableClaim)[] = [];
  let verified = 0;
  let unavailable = 0;
  for (const source of inventory.sources) {
    const claim = source.declaration.scope;
    if (claim.status === "unavailable") {
      unavailable++;
      sources.push(
        Object.freeze({
          status: "historical-provenance-unavailable",
          snapshotUri: source.declaration.snapshot.uri,
          reason: claim.reason,
        }),
      );
      continue;
    }
    if (usedSignatures.has(claim.signatureUri)) throw new Error("BASELINE_SOURCE_SIGNATURE_REUSED");
    usedSignatures.add(claim.signatureUri);
    const signatureArtifact = artifacts.get(claim.signatureUri);
    if (!signatureArtifact || signatureArtifact.representation !== "original")
      throw new Error("BASELINE_SOURCE_SIGNATURE_UNLISTED");
    const signaturePath = path.join(prepared.root, claim.signatureUri);
    const bytes = await readBoundedFile(signaturePath, MAX_SIGNATURE_BYTES);
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== signatureArtifact.sha256 || bytes.length !== signatureArtifact.bytes)
      throw new Error("BASELINE_SOURCE_SIGNATURE_CHANGED");
    const manifest = parseManifest(bytes);
    const parsedToken = parseSourceToken(manifest.source_token);
    if (
      parsedToken.raw !== manifest.source_token ||
      manifest.source_token !== claim.sourceToken ||
      `${parsedToken.year}-q${parsedToken.quarter}` !== prepared.manifest.period
    )
      throw new Error("BASELINE_SOURCE_SIGNATURE_PERIOD_MISMATCH");
    if (
      manifest.device_id !== claim.device ||
      manifest.app_id !== claim.producer ||
      manifest.content_hash !== source.original.sha256
    )
      throw new Error("BASELINE_SOURCE_SIGNATURE_CLAIM_MISMATCH");
    const key = keys.get(manifest.signing_key_id);
    if (
      !key ||
      key.signingKeyId !== manifest.signing_key_id ||
      !key.collectorId ||
      key.collectorId !== claim.device
    )
      throw new Error("BASELINE_SOURCE_SIGNATURE_KEY_BINDING_MISMATCH");
    let valid = false;
    try {
      valid = verifyLegacySourceSignature(manifest, key.publicKeyPem);
    } catch (error) {
      throw new Error("BASELINE_SOURCE_SIGNATURE_INVALID", { cause: error });
    }
    if (!valid) throw new Error("BASELINE_SOURCE_SIGNATURE_INVALID");
    verified++;
    sources.push(
      Object.freeze({
        status: "signed-token-original-bytes-match-supplied-device-key-snapshot-generation-unbound",
        snapshotUri: source.declaration.snapshot.uri,
        originalUri: source.original.uri,
        signatureUri: claim.signatureUri,
        signingKeyId: manifest.signing_key_id,
        device: manifest.device_id,
        sourceToken: manifest.source_token,
        originalSha256: manifest.content_hash,
        unsignedMetadata: Object.freeze({
          producer: manifest.app_id,
          appVersion: manifest.app_version,
          rowsSigned: manifest.rows_signed,
          signedAt: manifest.signed_at,
        }),
      }),
    );
  }
  // Close the race between evidence reads and the report: re-read every retained byte.
  for (const artifact of prepared.manifest.artifacts) {
    const actual = await inspectRetainedFile(path.join(prepared.root, artifact.uri));
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes)
      throw new Error("BASELINE_PROVENANCE_ARTIFACT_CHANGED");
  }
  return Object.freeze({
    schema: "hdri-baseline-provenance@1",
    manifestSha256: prepared.manifestSha256,
    status: "cryptography-checked-not-admitted",
    keyAuthority: "caller-supplied-not-authenticated",
    signaturesVerifiedAgainstSuppliedKeys: verified,
    unavailableClaims: unavailable,
    sources: Object.freeze(sources),
  });
}
