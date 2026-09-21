/*
<MODULE_CONTRACT>
<purpose>Sign and verify complete closed source-snapshot generation manifests.</purpose>
<non-goals><item>Does not create SQLite snapshots, load trust registries, or admit a source batch.</item></non-goals>
<!-- risk: crypto, sign -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Replace the main-file legacy signature with a canonical complete-generation contract.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Every semantic field except the detached signature is covered by the canonical Ed25519 payload.
import crypto from "node:crypto";
import { canonicalize } from "./canonicalize.js";
import { parseSourceToken } from "./source-token.js";
import type { SigningKeyConfig } from "./types.js";

const SHA256 = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TOP_LEVEL_FIELDS = [
  "schema",
  "digest_domain",
  "device_id",
  "signing_key_id",
  "source_token",
  "app_id",
  "app_version",
  "snapshot",
  "domain_counts",
  "rows_signed",
  "signed_at",
  "signature",
] as const;

export type SourceSnapshotArtifact = Readonly<{
  uri: "source-snapshot.sqlite";
  sha256: string;
  bytes: number;
}>;
export type SourceDomainCount = Readonly<{ domain: string; rows: number }>;
export type SourceSignatureManifest = Readonly<{
  schema: "hdri-source-signature@2";
  digest_domain: "hdri-closed-sqlite-snapshot@1";
  device_id: string;
  signing_key_id: string;
  source_token: string;
  app_id: string;
  app_version: string;
  snapshot: SourceSnapshotArtifact;
  domain_counts: readonly SourceDomainCount[];
  rows_signed: number;
  signed_at: string;
  signature: string;
}>;
export type SourceSignaturePayload = Omit<SourceSignatureManifest, "signature">;

function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    throw new Error("INVALID_SOURCE_SIGNATURE_SHAPE");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    Buffer.byteLength(value) > 4096 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  )
    throw new Error("INVALID_SOURCE_SIGNATURE_TEXT");
  return value;
}

function safeCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("INVALID_SOURCE_SIGNATURE_COUNT");
  return value as number;
}

function rejectDuplicateJsonMembers(json: string): void {
  const stack: ({ type: "object"; keys: Set<string> } | { type: "array" })[] = [];
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (char === "{") stack.push({ type: "object", keys: new Set() });
    else if (char === "[") stack.push({ type: "array" });
    else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
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
        if (frame.keys.has(key)) throw new Error("DUPLICATE_SOURCE_SIGNATURE_FIELD");
        frame.keys.add(key);
      }
    }
  }
}

export function parseSourceSignatureManifest(json: string): SourceSignatureManifest {
  if (Buffer.byteLength(json) > 1024 * 1024) throw new Error("SOURCE_SIGNATURE_SIZE_LIMIT");
  let value: unknown;
  try {
    value = JSON.parse(json);
    rejectDuplicateJsonMembers(json);
  } catch (error) {
    throw new Error("INVALID_SOURCE_SIGNATURE_JSON", { cause: error });
  }
  const object = exactObject(value, TOP_LEVEL_FIELDS);
  const snapshot = exactObject(object.snapshot, ["uri", "sha256", "bytes"]);
  if (snapshot.uri !== "source-snapshot.sqlite" || !SHA256.test(text(snapshot.sha256)))
    throw new Error("INVALID_SOURCE_SIGNATURE_SNAPSHOT");
  const snapshotBytes = safeCount(snapshot.bytes);
  if (!snapshotBytes) throw new Error("INVALID_SOURCE_SIGNATURE_SNAPSHOT");
  if (!Array.isArray(object.domain_counts) || !object.domain_counts.length)
    throw new Error("INVALID_SOURCE_SIGNATURE_DOMAINS");
  let previous: Buffer | undefined;
  const domainCounts = object.domain_counts.map((value) => {
    const entry = exactObject(value, ["domain", "rows"]);
    const domain = text(entry.domain);
    const key = Buffer.from(domain);
    if (previous && Buffer.compare(previous, key) >= 0)
      throw new Error("INVALID_SOURCE_SIGNATURE_DOMAIN_ORDER");
    previous = key;
    return Object.freeze({ domain, rows: safeCount(entry.rows) });
  });
  const rowsSigned = safeCount(object.rows_signed);
  if (domainCounts.reduce((total, entry) => total + entry.rows, 0) !== rowsSigned)
    throw new Error("SOURCE_SIGNATURE_ROW_COUNT_MISMATCH");
  const signedAt = text(object.signed_at);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(signedAt) ||
    Number.isNaN(Date.parse(signedAt)) ||
    new Date(signedAt).toISOString() !== signedAt
  )
    throw new Error("INVALID_SOURCE_SIGNATURE_TIME");
  const signature = text(object.signature);
  if (
    !BASE64URL.test(signature) ||
    Buffer.from(signature, "base64url").length !== 64 ||
    Buffer.from(signature, "base64url").toString("base64url") !== signature
  )
    throw new Error("INVALID_SOURCE_SIGNATURE_VALUE");
  const sourceToken = text(object.source_token);
  if (parseSourceToken(sourceToken).raw !== sourceToken)
    throw new Error("INVALID_SOURCE_SIGNATURE_TOKEN");
  if (
    object.schema !== "hdri-source-signature@2" ||
    object.digest_domain !== "hdri-closed-sqlite-snapshot@1"
  )
    throw new Error("UNSUPPORTED_SOURCE_SIGNATURE_SCHEMA");
  return Object.freeze({
    schema: "hdri-source-signature@2",
    digest_domain: "hdri-closed-sqlite-snapshot@1",
    device_id: text(object.device_id),
    signing_key_id: text(object.signing_key_id),
    source_token: sourceToken,
    app_id: text(object.app_id),
    app_version: text(object.app_version),
    snapshot: Object.freeze({
      uri: "source-snapshot.sqlite",
      sha256: snapshot.sha256 as string,
      bytes: snapshotBytes,
    }),
    domain_counts: Object.freeze(domainCounts),
    rows_signed: rowsSigned,
    signed_at: signedAt,
    signature,
  });
}

function payloadOf(manifest: SourceSignatureManifest): SourceSignaturePayload {
  const { signature: _signature, ...payload } = manifest;
  return payload;
}

export function sourceSignaturePayload(manifest: SourceSignatureManifest): string {
  return canonicalize(payloadOf(manifest));
}

export function signSource(args: {
  signingKey: SigningKeyConfig;
  sourceToken: string;
  appId: string;
  appVersion: string;
  snapshot: SourceSnapshotArtifact;
  domainCounts: readonly SourceDomainCount[];
  signedAt?: string;
}): SourceSignatureManifest {
  const domainCounts = Object.freeze(args.domainCounts.map((entry) => Object.freeze({ ...entry })));
  const payload: SourceSignaturePayload = Object.freeze({
    schema: "hdri-source-signature@2",
    digest_domain: "hdri-closed-sqlite-snapshot@1",
    device_id: args.signingKey.collectorId,
    signing_key_id: args.signingKey.signingKeyId,
    source_token: args.sourceToken,
    app_id: args.appId,
    app_version: args.appVersion,
    snapshot: Object.freeze({ ...args.snapshot }),
    domain_counts: domainCounts,
    rows_signed: domainCounts.reduce((total, entry) => total + entry.rows, 0),
    signed_at: args.signedAt ?? new Date().toISOString(),
  });
  const privateKey = crypto.createPrivateKey(args.signingKey.privateKeyPem);
  const signature = crypto
    .sign(null, Buffer.from(canonicalize(payload), "utf8"), privateKey)
    .toString("base64url");
  return parseSourceSignatureManifest(canonicalize({ ...payload, signature }));
}

export function verifySourceSignature(
  manifest: SourceSignatureManifest,
  publicKeyPem: string,
): boolean {
  const publicKey = crypto.createPublicKey(publicKeyPem);
  return crypto.verify(
    null,
    Buffer.from(sourceSignaturePayload(manifest), "utf8"),
    publicKey,
    Buffer.from(manifest.signature, "base64url"),
  );
}
