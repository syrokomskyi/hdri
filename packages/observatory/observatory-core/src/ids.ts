/*
<MODULE_CONTRACT>
<purpose>Generates unique, deterministic, and canonical IDs for observatory entities using cryptographic methods. Also defines the IdentityRequest type for cross-year identity resolution.</purpose>
<non-goals>
  <item>Does not provide ID validation or verification mechanisms.</item>
  <item>Does not handle persistence or storage of generated IDs.</item>
  <item>Does not implement identity resolution logic — that lives in the app's mint-core.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of ID generation and parsing utilities.</item>
  <item>Consolidate mintAssetId (UUIDv7) and IdentityRequest type from @syrokomskyi/observatory-asset-id.</item>
</CHANGE_SUMMARY>
*/

/**
 * Deterministic and unique ID generation for observatory entities.
 *
 * Uses crypto.randomUUID() for UUIDs. For deterministic IDs derived from
 * domain data (e.g. asset_id from first-seen domain), uses a namespace-based
 * approach via SHA-256 to guarantee stability across runs.
 */

import { randomUUID } from "node:crypto";
import { uuidv7 } from "uuidv7";

import { sha256 } from "./hashing.js";

/**
 * Generate a new random UUID (v4). Used for observation_id, run_id, etc.
 */
export const newId = (): string => randomUUID();

/**
 * Derive a deterministic asset_id from a normalised domain.
 *
 * The asset_id is stable: same normalised domain always yields the same id.
 * Format: "da-" prefix + first 32 hex chars of SHA-256(namespace + domain).
 *
 * The dash separator (rather than underscore) aligns the provisional ID with
 * the canonical UUIDv7 format minted by the observatory (8-4-4-4-12 dashed),
 * making provisional/canonical IDs visually distinguishable by prefix only.
 */
export const deriveAssetId = (normalisedDomain: string): string => {
  const hash = sha256(`observatory:asset:${normalisedDomain}`);
  return `da-${hash.slice(0, 32)}`;
};

/**
 * Derive a deterministic public asset ID that cannot be reversed to the
 * original domain. Uses a one-way keyed hash.
 */
export const derivePublicAssetId = (assetId: string, dailySalt: string): string => {
  const hash = sha256(`public:${dailySalt}:${assetId}`);
  return `pub_${hash.slice(0, 16)}`;
};

/**
 * Mint a new canonical asset_id for a domain observed for the first time.
 * Returns a UUIDv7 string: lexicographically sortable, time-ordered.
 */
export function mintAssetId(): string {
  return uuidv7();
}

/**
 * Request to resolve a provisional asset identity to a canonical one.
 * Used by the cross-year identity resolution (WP12).
 */
export type IdentityRequest = {
  /** Deterministic `da-…` id (stable across years). */
  readonly provisionalId: string;
  readonly domain: string;
};

const PERIOD_RE = /^(\d{4})-q([1-4])$/;

export type ParsedPeriod = {
  year: number;
  quarter: number;
};

export const parsePeriod = (period: string): ParsedPeriod => {
  const normalised = period.toLowerCase();
  const m = PERIOD_RE.exec(normalised);
  if (!m) {
    throw new Error(`Invalid period format "${period}" — expected YYYY-qn (e.g. "2026-q2")`);
  }
  return { year: parseInt(m[1]!, 10), quarter: parseInt(m[2]!, 10) };
};
