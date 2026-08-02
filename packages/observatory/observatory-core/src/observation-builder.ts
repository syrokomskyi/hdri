/*
<MODULE_CONTRACT>
<purpose>Constructs Observation objects ensuring correct value type assignment and reduces boilerplate in data collection processes.</purpose>
<non-goals>
  <item>Does not perform data validation beyond type matching.</item>
  <item>Does not handle persistence or storage of Observation objects.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation of Observation builder functions for various data types.</item>
  <item>Use makeValueFields from value.ts — the exactly-one invariant is now owned by one module.</item>
</CHANGE_SUMMARY>
*/

/**
 * Builder for creating well-formed Observation objects.
 *
 * Enforces the invariant that exactly one value_* column is populated
 * and that value_type matches. Reduces boilerplate in collector/translator
 * gogols.
 */

import type { Observation, ObservationValueType } from "./types.js";
import { newId } from "./ids.js";
import { makeValueFields } from "./value.js";

export type ObservationInit = {
  readonly asset_id: string;
  readonly crawl_id: string;
  readonly signal_path: string;
  readonly observed_at: string;
  readonly collector_version: string;
  readonly ruleset_version: string;
  readonly probe_version?: string;
  readonly source_hash?: string;
  readonly crawl_hash?: string;
  readonly evidence_ref?: string;
  readonly confidence?: number;
};

/**
 * Create a boolean observation.
 */
export const boolObs = (init: ObservationInit, value: boolean): Observation =>
  buildObservation(init, "bool", value, null, null, null);

/**
 * Create a numeric observation.
 */
export const numObs = (init: ObservationInit, value: number): Observation =>
  buildObservation(init, "num", null, value, null, null);

/**
 * Create a string observation.
 */
export const strObs = (init: ObservationInit, value: string): Observation =>
  buildObservation(init, "str", null, null, value, null);

/**
 * Create a JSON observation.
 */
export const jsonObs = (init: ObservationInit, value: unknown): Observation =>
  buildObservation(init, "json", null, null, null, JSON.stringify(value));

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const buildObservation = (
  init: ObservationInit,
  value_type: ObservationValueType,
  value_bool: boolean | null,
  value_num: number | null,
  value_str: string | null,
  value_json: string | null,
): Observation => ({
  observation_id: newId(),
  asset_id: init.asset_id,
  crawl_id: init.crawl_id,
  signal_path: init.signal_path,
  ...makeValueFields(value_bool, value_num, value_str, value_json),
  value_type,
  observed_at: init.observed_at,
  recorded_at: new Date().toISOString(),
  collector_version: init.collector_version,
  probe_version: init.probe_version ?? null,
  ruleset_version: init.ruleset_version,
  source_hash: init.source_hash ?? null,
  crawl_hash: init.crawl_hash ?? null,
  evidence_ref: init.evidence_ref ?? null,
  confidence: init.confidence ?? 1.0,
  status: "active",
  superseded_by: null,
  deprecated_reason: null,
});
