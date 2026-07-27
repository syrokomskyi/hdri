/*
<MODULE_CONTRACT>
<purpose>Pure, streaming verification of signed observations (WP16 finding-1 fix). Consumes an
ITERABLE of DB rows — not a materialized array — so the vault verifier bounds its memory even at
Q3's millions of observations (each row carries a large obs_json). Applies the same three checks the
CLI always did: known key, trusted-key policy (validity window / revocation), and the ed25519
signature. Extracted from run/verify-vault.ts so the logic is unit-tested without a DB.</purpose>
<non-goals>
  <item>No DB or file I/O — the caller streams rows (better-sqlite3 .iterate()) and loads keys.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 finding-1: stream verification (bounded memory) + testable core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import {
  evaluateKeyTrust,
  findTrustedKey,
  verifyObservation,
} from "@syrokomskyi/observatory-crypto";
import type {
  SignedObservation,
  TrustedKeysManifest,
  VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";

/** One signed observation row as stored in the observatory DB. */
export type SignedRow = {
  id: string;
  obs_json: string;
  signature: string;
  signed_at: string;
  signing_key_id: string;
  collector_id: string;
};

export type VerifyTally = {
  total: number;
  valid: number;
  invalid: number;
  parseErrors: number;
  /** Rows whose signing_key_id has no loaded public key. */
  unknownKey: number;
  /** Rows rejected by the trusted-keys policy (revoked / outside validity window). */
  untrusted: number;
  /** Up to `maxFailedIds` failure descriptions (bounded — a mass failure won't grow unbounded). */
  failedIds: string[];
  /** Total number of failures (may exceed failedIds.length). */
  failedCount: number;
};

/**
 * Verifies a stream of signed rows against the loaded keys and (optionally) the trusted-keys
 * policy. A row is valid only if its key is known, the trust policy accepts it (when a manifest is
 * given), its obs_json parses, and its ed25519 signature checks out. Iterates lazily, so the caller
 * can pass a database cursor and never materialize the full result set.
 */
export function verifySignedRows(
  rows: Iterable<SignedRow>,
  keysByKeyId: ReadonlyMap<string, VerificationKey>,
  trustManifest: TrustedKeysManifest | null,
  opts: { maxFailedIds?: number } = {},
): VerifyTally {
  const maxFailedIds = opts.maxFailedIds ?? 100;
  let total = 0;
  let valid = 0;
  let invalid = 0;
  let parseErrors = 0;
  let unknownKey = 0;
  let untrusted = 0;
  let failedCount = 0;
  const failedIds: string[] = [];

  const fail = (desc: string): void => {
    invalid++;
    failedCount++;
    if (failedIds.length < maxFailedIds) failedIds.push(desc);
  };

  for (const row of rows) {
    total++;

    const vk = keysByKeyId.get(row.signing_key_id);
    if (!vk) {
      unknownKey++;
      fail(`${row.id} (unknown signing_key_id=${row.signing_key_id})`);
      continue;
    }

    if (trustManifest) {
      const trust = evaluateKeyTrust(
        findTrustedKey(trustManifest, row.signing_key_id),
        row.signed_at,
      );
      if (!trust.trusted) {
        untrusted++;
        fail(`${row.id} (untrusted: ${trust.reason})`);
        continue;
      }
    }

    let obs: Observation;
    try {
      obs = JSON.parse(row.obs_json) as Observation;
    } catch {
      parseErrors++;
      fail(`${row.id} (parse error)`);
      continue;
    }

    const signedObs: SignedObservation = {
      ...obs,
      signature: row.signature,
      signed_at: row.signed_at,
      signing_key_id: row.signing_key_id,
      collector_id: row.collector_id,
    };

    if (verifyObservation(signedObs, vk)) valid++;
    else fail(row.id);
  }

  return { total, valid, invalid, parseErrors, unknownKey, untrusted, failedIds, failedCount };
}
