/*
<MODULE_CONTRACT>
<purpose>Manages trusted-key registry by parsing manifests and evaluating key trust based on policy.</purpose>
<non-goals>
  <item>Does not perform cryptographic verification of signatures.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of trusted-key registry with policy evaluation.</item>
</CHANGE_SUMMARY>
*/

/**
 * Trusted-key registry (key rotation, WP16 (f)).
 *
 * The vault verifier historically trusted ANY `.pem` sitting in `transparency/keys/`,
 * with no notion of when a key was valid or whether it was retired/compromised. For a
 * public index meant to last decades that is not enough: keys must rotate, and a reader
 * must be able to see exactly which keys the index trusts, since when, and until when.
 *
 * `transparency/keys/trusted-keys.json` is that published root of trust — one entry per
 * key with its `signingKeyId`, the SPKI PEM it corresponds to (by sha256), a `status`
 * (active / retired / revoked) and an optional validity window. This module is pure: it
 * parses the manifest and decides whether a signature made at a given time by a given key
 * is trusted. Cryptographic verification (ed25519) is separate and still required — this
 * is the POLICY layer on top of it.
 */

/** Lifecycle of a signing key. */
export type TrustedKeyStatus = "active" | "retired" | "revoked";

/** One published, trusted signing key. */
export type TrustedKeyEntry = {
  /** Canonical `<deviceId>-<sha256(pubkey).first16hex>` — matches observations.signing_key_id. */
  readonly signingKeyId: string;
  /** The device/label that owns the key (the pem basename). */
  readonly deviceId: string;
  /** The SPKI PEM filename under transparency/keys/. */
  readonly pemFile: string;
  /** Full sha256 of the SPKI PEM — integrity of the published key material. */
  readonly sha256: string;
  readonly status: TrustedKeyStatus;
  /** ISO 8601; signatures dated before this are not trusted. Null → open-ended past. */
  readonly validFrom: string | null;
  /** ISO 8601; signatures dated after this are not trusted. Null → open-ended future. */
  readonly validUntil: string | null;
  /** Human-readable role of the key. */
  readonly purpose?: string;
  /** For status=revoked: when/why, for the transparency record. */
  readonly note?: string;
};

export type TrustedKeysManifest = {
  readonly kind: "observatory-trusted-keys";
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly keys: readonly TrustedKeyEntry[];
};

/** Result of the trust-policy decision for one signature. */
export type KeyTrust = { readonly trusted: boolean; readonly reason: string };

/** Type-guard + shape validation for a parsed trusted-keys manifest. */
export function parseTrustedKeysManifest(value: unknown): TrustedKeysManifest {
  const m = value as Partial<TrustedKeysManifest>;
  if (!m || m.kind !== "observatory-trusted-keys" || !Array.isArray(m.keys)) {
    throw new Error("not a valid observatory-trusted-keys manifest");
  }
  for (const k of m.keys) {
    if (!k.signingKeyId || !k.sha256 || !k.status) {
      throw new Error(
        `trusted-keys entry missing signingKeyId/sha256/status: ${JSON.stringify(k)}`,
      );
    }
    if (k.status !== "active" && k.status !== "retired" && k.status !== "revoked") {
      throw new Error(`trusted-keys entry has unknown status "${k.status}"`);
    }
  }
  return m as TrustedKeysManifest;
}

/** Finds the entry for a signing_key_id, or undefined. */
export function findTrustedKey(
  manifest: TrustedKeysManifest,
  signingKeyId: string,
): TrustedKeyEntry | undefined {
  return manifest.keys.find((k) => k.signingKeyId === signingKeyId);
}

/**
 * Decides whether a signature produced at `signedAt` by the key described by `entry` is
 * trusted by policy. Cryptographic validity is assumed to be checked separately.
 *
 *  - no entry            → not trusted (key is not in the published root of trust);
 *  - status "revoked"    → not trusted at all (the key is considered compromised);
 *  - signedAt < validFrom or > validUntil → not trusted (outside the key's validity window);
 *  - otherwise           → trusted (active or retired within its window — retired keys still
 *    validate their historical signatures, which is what keeps old periods verifiable).
 */
export function evaluateKeyTrust(entry: TrustedKeyEntry | undefined, signedAt: string): KeyTrust {
  if (!entry) return { trusted: false, reason: "signing_key_id not in trusted-keys manifest" };
  if (entry.status === "revoked") {
    return { trusted: false, reason: `key revoked${entry.note ? ` (${entry.note})` : ""}` };
  }

  const t = Date.parse(signedAt);
  if (Number.isNaN(t)) return { trusted: false, reason: `unparseable signed_at "${signedAt}"` };

  if (entry.validFrom) {
    const from = Date.parse(entry.validFrom);
    if (!Number.isNaN(from) && t < from) {
      return {
        trusted: false,
        reason: `signed_at ${signedAt} is before key validFrom ${entry.validFrom}`,
      };
    }
  }
  if (entry.validUntil) {
    const until = Date.parse(entry.validUntil);
    if (!Number.isNaN(until) && t > until) {
      return {
        trusted: false,
        reason: `signed_at ${signedAt} is after key validUntil ${entry.validUntil}`,
      };
    }
  }
  return { trusted: true, reason: `trusted (${entry.status})` };
}
