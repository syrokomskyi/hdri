/*
<MODULE_CONTRACT>
<purpose>Verifies ed25519 signatures on observations to ensure data integrity and authenticity.</purpose>
<non-goals>
  <item>Does not handle key management or storage.</item>
  <item>Does not throw exceptions on signature verification failure.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of signature verification functions.</item>
  <item>Add trust-aware verifySignedObservation — combines key-registry policy + ed25519 in one call.</item>
</CHANGE_SUMMARY>
*/

import crypto from "node:crypto";
import { signingPayload } from "./sign.js";
import { findTrustedKey, evaluateKeyTrust } from "./key-registry.js";
import type { SignedObservation, VerificationKey } from "./types.js";
import type { TrustedKeysManifest } from "./key-registry.js";

/**
 * Verifies the ed25519 signature on a SignedObservation.
 *
 * Returns true if the signature is valid for the given public key.
 * Returns false on any verification failure (bad sig, wrong key, corrupt data).
 *
 * Does NOT throw on invalid signatures — callers that need hard failure
 * should check the return value and throw themselves.
 */
export function verifyObservation(signed: SignedObservation, vk: VerificationKey): boolean {
  try {
    if (signed.signing_key_id !== vk.signingKeyId) return false;

    const payload = signingPayload(signed);
    const sigBytes = Buffer.from(signed.signature, "base64url");
    const publicKey = crypto.createPublicKey(vk.publicKeyPem);

    return crypto.verify(null, payload, publicKey, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Verifies a batch of SignedObservations against one key.
 * Returns the indices of any observations that fail verification.
 */
export function verifyObservations(
  observations: readonly SignedObservation[],
  vk: VerificationKey,
): number[] {
  const failed: number[] = [];
  for (let i = 0; i < observations.length; i++) {
    if (!verifyObservation(observations[i]!, vk)) failed.push(i);
  }
  return failed;
}

export type VerificationResult = {
  readonly valid: boolean;
  readonly reason: string;
};

/**
 * Trust-aware verification: checks the trusted-keys policy (when a manifest is
 * provided) AND the ed25519 signature in one call.
 *
 * When no manifest is given, behaves like verifyObservation but returns a
 * VerificationResult instead of a bare boolean.
 */
export function verifySignedObservation(
  signed: SignedObservation,
  vk: VerificationKey,
  manifest?: TrustedKeysManifest,
): VerificationResult {
  if (manifest) {
    const entry = findTrustedKey(manifest, signed.signing_key_id);
    const trust = evaluateKeyTrust(entry, signed.signed_at);
    if (!trust.trusted) {
      return { valid: false, reason: trust.reason };
    }
  }

  const ok = verifyObservation(signed, vk);
  return {
    valid: ok,
    reason: ok ? "valid" : "ed25519 signature verification failed",
  };
}
