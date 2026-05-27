/**
 * Deterministic hashing helpers for observatory data.
 *
 * Used for provenance, deduplication, and theory reconstruction.
 * All hashing is SHA-256, hex-encoded, and deterministic: same input
 * always yields the same hash regardless of key order in objects.
 */

import { createHash } from 'node:crypto';

/**
 * SHA-256 hex hash of a UTF-8 string.
 */
export const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf-8').digest('hex');

/**
 * Deterministic SHA-256 of a JSON-serialisable value.
 * Object keys are sorted recursively to guarantee the same hash
 * regardless of insertion order.
 */
export const sha256Json = (value: unknown): string =>
  sha256(stableStringify(value));

/**
 * Computation hash for a scoring run: captures the scorer version and
 * the exact set of input observation IDs so that theory reconstruction
 * can verify whether a score was recomputed with different inputs.
 */
export const computationHash = (
  codebookVersion: string,
  observationIds: readonly string[],
): string => {
  const sorted = [...observationIds].sort();
  return sha256Json({ codebookVersion, observationIds: sorted });
};

// ---------------------------------------------------------------------------
// Stable JSON stringify (deterministic key order)
// ---------------------------------------------------------------------------

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
    return '{' + entries.join(',') + '}';
  }
  return String(value);
};
