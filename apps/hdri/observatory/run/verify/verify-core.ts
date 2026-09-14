/*
<MODULE_CONTRACT>
<purpose>Pure, streaming verification of signed observations (WP16 finding-1 fix). Consumes an
ITERABLE of DB rows, checking row/payload identity and signing-envelope consistency alongside
known-key, trusted-key policy and ed25519 verification. Retains bounded diagnostics, not rows.</purpose>
<non-goals>
  <item>No DB or file I/O — the caller streams rows (better-sqlite3 .iterate()) and loads keys.</item>
  <item>Does not authenticate the archive, enforce SQLite cell bounds, or validate the complete Observation/domain schema.</item>
  <item>Signing metadata is excluded from the historical signature; agreement is not cryptographic authentication of that metadata.</item>
</non-goals>
<!-- risk: sign -->
<!-- risk: crypto -->
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 finding-1: stream verification (bounded memory) + testable core.</item>
  <item>Reject substituted row IDs and contradictory or partial embedded signing envelopes; bound diagnostic configuration and entries.</item>
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

const MAX_FAILED_IDS = 10_000;
const MAX_DIAGNOSTIC_CHARACTERS = 512;
const SIGNING_FIELDS = ["signature", "signed_at", "signing_key_id", "collector_id"] as const;

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
  /** Row ID or embedded signing metadata disagrees with the database envelope. */
  inconsistent: number;
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
 * given), its payload is an object with the same observation ID, any embedded signing
 * envelope is complete and agrees, and its ed25519 signature checks out. The current
 * writer stores the base payload; retained signed payloads carry all four signing fields.
 * Neither is rewritten. This is signature/identity checking, not full row validation.
 * Iterates lazily; callers must bound individual cells before driver allocation.
 */
export function verifySignedRows(
  rows: Iterable<SignedRow>,
  keysByKeyId: ReadonlyMap<string, VerificationKey>,
  trustManifest: TrustedKeysManifest | null,
  opts: { maxFailedIds?: number } = {},
): VerifyTally {
  const maxFailedIds = opts.maxFailedIds ?? 100;
  if (!Number.isInteger(maxFailedIds) || maxFailedIds < 0 || maxFailedIds > MAX_FAILED_IDS) {
    throw new Error("maxFailedIds must be an integer between 0 and 10000");
  }
  let total = 0;
  let valid = 0;
  let invalid = 0;
  let parseErrors = 0;
  let inconsistent = 0;
  let unknownKey = 0;
  let untrusted = 0;
  let failedCount = 0;
  const failedIds: string[] = [];

  const fail = (desc: string): void => {
    invalid++;
    failedCount++;
    if (failedIds.length < maxFailedIds) failedIds.push(desc.slice(0, MAX_DIAGNOSTIC_CHARACTERS));
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

    let payload: unknown;
    try {
      payload = JSON.parse(row.obs_json);
    } catch {
      parseErrors++;
      fail(`${row.id} (parse error)`);
      continue;
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      parseErrors++;
      fail(`${row.id} (payload must be an object)`);
      continue;
    }
    const object = payload as Record<string, unknown>;
    const embedded = SIGNING_FIELDS.some((field) => Object.hasOwn(object, field));
    if (
      typeof row.id !== "string" ||
      row.id.trim().length === 0 ||
      object.observation_id !== row.id ||
      (embedded &&
        SIGNING_FIELDS.some(
          (field) => !Object.hasOwn(object, field) || object[field] !== row[field],
        ))
    ) {
      inconsistent++;
      fail(`${row.id} (row/payload identity or signing envelope mismatch)`);
      continue;
    }

    const signedObs: SignedObservation = {
      ...(object as Observation),
      signature: row.signature,
      signed_at: row.signed_at,
      signing_key_id: row.signing_key_id,
      collector_id: row.collector_id,
    };

    if (verifyObservation(signedObs, vk)) valid++;
    else fail(row.id);
  }

  return {
    total,
    valid,
    invalid,
    parseErrors,
    inconsistent,
    unknownKey,
    untrusted,
    failedIds,
    failedCount,
  };
}
