/**
 * Deterministic and unique ID generation for observatory entities.
 *
 * Uses crypto.randomUUID() for UUIDs. For deterministic IDs derived from
 * domain data (e.g. asset_id from first-seen domain), uses a namespace-based
 * approach via SHA-256 to guarantee stability across runs.
 */

import { randomUUID } from 'node:crypto';

import { sha256 } from './hashing.js';

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
export const derivePublicAssetId = (
  assetId: string,
  dailySalt: string,
): string => {
  const hash = sha256(`public:${dailySalt}:${assetId}`);
  return `pub_${hash.slice(0, 16)}`;
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
    throw new Error(
      `Invalid period format "${period}" — expected YYYY-qn (e.g. "2026-q2")`,
    );
  }
  return { year: parseInt(m[1]!, 10), quarter: parseInt(m[2]!, 10) };
};
