/**
 * Transparency-key helpers for multi-device signature verification.
 *
 * In a multi-device factory deployment each `signing_key_id` looks like
 * "<DEVICE_ID>-<pubkey-fingerprint>" and the matching SPKI PEM is committed at
 * `transparency/keys/<DEVICE_ID>.pem`. These helpers load all such pubkeys,
 * build a lookup map keyed by signing_key_id, and verify source-signature
 * manifests against the corresponding public key.
 */

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { findRepoRoot } from './device.js';
import { verifySourceSignature } from './sign-source.js';
import type { SourceSignatureManifest } from './sign-source.js';
import type { VerificationKey } from './types.js';

export type VerificationKeyMap = ReadonlyMap<string, VerificationKey>;

/**
 * Returns the canonical transparency keys directory path (`transparency/keys/`
 * under the repository root). Uses `findRepoRoot()` to locate the workspace.
 */
export function getTransparencyKeysDir(): string {
  return path.join(findRepoRoot(), 'transparency', 'keys');
}

/**
 * Loads every public key in `transparencyDir` and indexes them by the
 * canonical `signing_key_id` (= `<deviceId>-<sha256(pubkey).first16hex>`).
 *
 * @throws if the directory cannot be read.
 */
export async function loadVerificationKeys(transparencyDir: string): Promise<VerificationKeyMap> {
  const keysByKeyId = new Map<string, VerificationKey>();
  const entries = await fsp.readdir(transparencyDir).catch(() => [] as string[]);
  const pemFiles = entries.filter((f) => f.endsWith('.pem'));

  for (const file of pemFiles) {
    const deviceId = path.basename(file, '.pem');
    const publicKeyPem = await fsp.readFile(path.join(transparencyDir, file), 'utf-8');
    const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
    const signingKeyId = `${deviceId}-${fingerprint}`;
    keysByKeyId.set(signingKeyId, { publicKeyPem, signingKeyId });
  }

  return keysByKeyId;
}

export type UpstreamVerificationResult =
  | { ok: true; manifest: SourceSignatureManifest }
  | { ok: false; manifest: SourceSignatureManifest; reason: string };

/**
 * Verifies a `SourceSignatureManifest` against a loaded key map.
 *
 * Returns an `{ ok, reason }` tuple so callers can collect errors across
 * multiple manifests without short-circuiting on the first failure.
 */
export function verifyUpstreamManifest(
  manifest: SourceSignatureManifest,
  keyMap: VerificationKeyMap,
): UpstreamVerificationResult {
  const vk = keyMap.get(manifest.signing_key_id);
  if (!vk) {
    return {
      ok: false,
      manifest,
      reason: `Unknown signing_key_id: ${manifest.signing_key_id}`,
    };
  }

  const valid = verifySourceSignature(manifest, vk.publicKeyPem);
  if (!valid) {
    return {
      ok: false,
      manifest,
      reason: `Signature verification failed for signing_key_id=${manifest.signing_key_id}`,
    };
  }

  return { ok: true, manifest };
}
