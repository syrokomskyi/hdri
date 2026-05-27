import crypto from 'node:crypto';
import { signingPayload } from './sign.js';
import type { SignedObservation, VerificationKey } from './types.js';

/**
 * Verifies the ed25519 signature on a SignedObservation.
 *
 * Returns true if the signature is valid for the given public key.
 * Returns false on any verification failure (bad sig, wrong key, corrupt data).
 *
 * Does NOT throw on invalid signatures — callers that need hard failure
 * should check the return value and throw themselves.
 */
export function verifyObservation(
  signed: SignedObservation,
  vk: VerificationKey,
): boolean {
  try {
    if (signed.signing_key_id !== vk.signingKeyId) return false;

    const payload = signingPayload(signed);
    const sigBytes = Buffer.from(signed.signature, 'base64url');
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
