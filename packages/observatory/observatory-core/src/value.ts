/*
<MODULE_CONTRACT>
<purpose>Owns the observation value invariant: the value type union, the exactly-one-populated checker, and the builder helpers that enforce it at construction.</purpose>
<non-goals>
  <item>Does not define the full Observation type — that lives in types.ts.</item>
  <item>Does not validate against an ontology — that lives in ontology/validate.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract value type union, populated-count checker, and value-set helper from types.ts, observation-builder.ts, and ontology/validate.ts into one module.</item>
</CHANGE_SUMMARY>
*/

/**
 * Observation value invariant.
 *
 * Every Observation has exactly one `value_*` column populated and a
 * `value_type` discriminator that matches it. This module owns that
 * invariant in three forms:
 *
 * 1. The `ObservationValueType` union (the type-level declaration).
 * 2. `countPopulatedValues` — the runtime checker used by the validator.
 * 3. `makeValueFields` — the constructor helper used by the builders.
 *
 * Adding a new value type requires changing only this module.
 */

/** Allowed observation value types matching the Parquet column set. */
export type ObservationValueType = "bool" | "num" | "str" | "json";

/** The four nullable value columns on an Observation. */
export type ObservationValueFields = {
  readonly value_bool: boolean | null;
  readonly value_num: number | null;
  readonly value_str: string | null;
  readonly value_json: string | null;
};

/**
 * Counts how many `value_*` columns are non-null.
 * The invariant requires exactly 1.
 */
export function countPopulatedValues(fields: ObservationValueFields): number {
  return [
    fields.value_bool !== null,
    fields.value_num !== null,
    fields.value_str !== null,
    fields.value_json !== null,
  ].filter(Boolean).length;
}

/**
 * Constructs the value fields for an Observation, given the type and the
 * single non-null value. The other three columns are set to null.
 * The caller is responsible for setting `value_type` on the Observation.
 */
export function makeValueFields(
  bool: boolean | null,
  num: number | null,
  str: string | null,
  json: string | null,
): ObservationValueFields {
  return { value_bool: bool, value_num: num, value_str: str, value_json: json };
}
