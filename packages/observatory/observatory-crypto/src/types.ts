/*
<MODULE_CONTRACT>
<purpose>Defines types for signed observations and key configurations to ensure secure data handling and verification.</purpose>
<non-goals>
  <item>Does not implement the logic for signing or verifying observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of types for signed observations and key configurations.</item>
</CHANGE_SUMMARY>
*/

import type { Observation } from "@syrokomskyi/observatory-core";

/**
 * An Observation with four appended signing fields.
 * The signature covers the base Observation fields only — the four signing
 * fields themselves are excluded from the signed payload.
 */
export type SignedObservation = Observation & {
  /** Base64url-encoded detached ed25519 signature. */
  readonly signature: string;
  /** ISO 8601 timestamp when the signature was produced (≈ recorded_at). */
  readonly signed_at: string;
  /**
   * Stable key label enabling rotation without breaking historical
   * verifiability. e.g. "hdo-institutional-2026".
   */
  readonly signing_key_id: string;
  /** Operational PC identifier — provenance only, not an authority claim. */
  readonly collector_id: string;
};

/** Runtime representation of the signing key loaded from .input/signing-key/. */
export type SigningKeyConfig = {
  /** PKCS8 PEM string. */
  readonly privateKeyPem: string;
  /** SPKI PEM string, published in transparency/keys/. */
  readonly publicKeyPem: string;
  /** Stable label, e.g. "hdo-institutional-2026". */
  readonly signingKeyId: string;
  /** Operational identifier for this collector machine. */
  readonly collectorId: string;
};

/** Thin public-key reference — used by verifiers that don't hold the private key. */
export type VerificationKey = {
  readonly publicKeyPem: string;
  readonly signingKeyId: string;
};
