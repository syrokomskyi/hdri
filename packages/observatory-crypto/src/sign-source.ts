/**
 * Per-source signature helpers.
 *
 * Used by every factory app's final `<N>-sign-source` gogol to produce a
 * single ed25519 signature covering the canonical content of that app's
 * primary tables for the current sourceToken.
 *
 * Per-Observation signing happens later in `a-contract-ontology` (see sign.ts).
 * This module is for the cheaper batch-level signature each numeric app emits.
 */

import crypto from 'node:crypto';
import type { SigningKeyConfig } from './types.js';

/**
 * Stable manifest written as `<N>-sign-source/source-signature.json` by every
 * factory app's final gogol. It tells observers and other devices that a given
 * (deviceId, sourceToken, app) snapshot has been sealed by a known key.
 */
export type SourceSignatureManifest = {
  readonly device_id: string;
  readonly signing_key_id: string;
  readonly source_token: string;
  readonly app_id: string;
  readonly app_version: string;
  readonly content_hash: string;
  readonly rows_signed: number;
  readonly signed_at: string;
  /** Base64url ed25519 signature of `${signing_key_id}\n${source_token}\n${content_hash}`. */
  readonly signature: string;
};

/**
 * Computes the canonical content hash for a sequence of rows.
 *
 * Rows must be passed already in the canonical order chosen by the app
 * (typically `ORDER BY <primary key>` in the SELECT). Each row is JSON-stringified
 * and joined by newlines; the SHA-256 of that text is the content hash.
 */
export function computeRowsetHash(rows: ReadonlyArray<Record<string, unknown>>): string {
  const canonical = rows.map((r) => JSON.stringify(r)).join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/**
 * Produces a SourceSignatureManifest given a content hash and signing key.
 * The signed payload is `${signing_key_id}\n${source_token}\n${content_hash}` so
 * verifiers can reconstruct it deterministically without parsing JSON.
 */
export function signSource(args: {
  signingKey: SigningKeyConfig;
  sourceToken: string;
  appId: string;
  appVersion: string;
  contentHash: string;
  rowsSigned: number;
}): SourceSignatureManifest {
  const payload = `${args.signingKey.signingKeyId}\n${args.sourceToken}\n${args.contentHash}`;
  const privateKey = crypto.createPrivateKey(args.signingKey.privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey);
  return {
    device_id: args.signingKey.collectorId,
    signing_key_id: args.signingKey.signingKeyId,
    source_token: args.sourceToken,
    app_id: args.appId,
    app_version: args.appVersion,
    content_hash: args.contentHash,
    rows_signed: args.rowsSigned,
    signed_at: new Date().toISOString(),
    signature: sig.toString('base64url'),
  };
}

/** Verifies a SourceSignatureManifest against a known public key (PEM). */
export function verifySourceSignature(
  manifest: SourceSignatureManifest,
  publicKeyPem: string,
): boolean {
  const payload = `${manifest.signing_key_id}\n${manifest.source_token}\n${manifest.content_hash}`;
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const sigBytes = Buffer.from(manifest.signature, 'base64url');
  return crypto.verify(null, Buffer.from(payload, 'utf-8'), publicKey, sigBytes);
}
