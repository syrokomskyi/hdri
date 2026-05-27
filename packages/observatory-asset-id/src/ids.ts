/**
 * Asset ID minting.
 *
 * Each unique eTLD+1 domain gets exactly one asset_id, minted the first time
 * that domain is observed. The ID is a UUIDv7 (time-ordered, lexicographically
 * sortable), stored in asset_states.parquet via SCD-2.
 *
 * ID lookup (domain → existing asset_id) happens at the gogol level against
 * the vault — this module only handles generation.
 *
 * For observations and pipeline run IDs we also expose a plain UUIDv4 via
 * Node.js crypto so callers have a single import path.
 */

import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

/**
 * Mint a new asset_id for a domain observed for the first time.
 * Returns a UUIDv7 string: lexicographically sortable, time-ordered.
 */
export function mintAssetId(): string {
  return uuidv7();
}

/**
 * Generate a random UUID (v4) for non-asset entities:
 * observation_id, run_id, event_id, etc.
 */
export function newId(): string {
  return randomUUID();
}
