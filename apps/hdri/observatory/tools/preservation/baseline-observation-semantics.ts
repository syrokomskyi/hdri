/*
<MODULE_CONTRACT>
<purpose>Validate retained observation rows against current structural Observation semantics before baseline materialization.</purpose>
<non-goals>
  <item>Does not authenticate source provenance, signatures, ontology files or evidence/CAS objects.</item>
  <item>Does not normalize retained values, repair invalid rows or infer missing measurement times.</item>
</non-goals>
<!-- risk: crypto -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: fail conversion on retained rows that cannot represent a current Observation without repair.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Semantic validation is lossless and fail-closed; retained values are never rewritten into validity.

import { parseImportedEvidenceIfClaimed } from "@syrokomskyi/observatory-core";
import { assertBaselineCanonicalId } from "./contracts.js";
import type { RetainedObservationSourceRow } from "./observation-source.js";

const SIGNAL_PATH = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const VALUE_TYPES = new Set(["bool", "num", "str", "json"]);
const STATUSES = new Set(["active", "superseded", "deprecated"]);
const COLLECTION_STATUSES = new Set([
  "absent",
  "unreachable",
  "forbidden",
  "not_applicable",
]);
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });

function text(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > 4096 ||
    hasControlCharacter(value)
  )
    throw new Error(`INVALID_CURRENT_OBSERVATION_${label}`);
}

function optionalText(value: unknown, label: string): void {
  if (value !== null) text(value, label);
}

function timestamp(value: unknown, label: string): void {
  text(value, label);
  if (!TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error(`INVALID_CURRENT_OBSERVATION_${label}`);
}

/** Validate only current structural semantics. Ontology/version provenance remains a separate gate. */
export function assertCurrentObservationSemantics(row: RetainedObservationSourceRow): void {
  const observation = row.payload;
  assertBaselineCanonicalId(observation.observation_id);
  assertBaselineCanonicalId(observation.asset_id);
  for (const field of ["crawl_id", "collector_version", "ruleset_version"] as const)
    text(observation[field], field.toUpperCase());
  text(observation.signal_path, "SIGNAL_PATH");
  if (!SIGNAL_PATH.test(observation.signal_path))
    throw new Error("INVALID_CURRENT_OBSERVATION_SIGNAL_PATH");
  if (typeof observation.value_type !== "string" || !VALUE_TYPES.has(observation.value_type))
    throw new Error("INVALID_CURRENT_OBSERVATION_VALUE_TYPE");

  const values = {
    bool: observation.value_bool,
    num: observation.value_num,
    str: observation.value_str,
    json: observation.value_json,
  };
  const populated = Object.entries(values).filter(([, value]) => value !== null);
  if (populated.length !== 1 || populated[0][0] !== observation.value_type)
    throw new Error("INVALID_CURRENT_OBSERVATION_VALUE_INVARIANT");
  if (values.bool !== null && typeof values.bool !== "boolean")
    throw new Error("INVALID_CURRENT_OBSERVATION_BOOL");
  if (values.num !== null && (typeof values.num !== "number" || !Number.isFinite(values.num)))
    throw new Error("INVALID_CURRENT_OBSERVATION_NUM");
  if (
    values.str !== null &&
    (typeof values.str !== "string" || Buffer.byteLength(values.str) > 8 * 1024 * 1024)
  )
    throw new Error("INVALID_CURRENT_OBSERVATION_STR");
  if (values.json !== null) {
    if (typeof values.json !== "string" || Buffer.byteLength(values.json) > 8 * 1024 * 1024)
      throw new Error("INVALID_CURRENT_OBSERVATION_JSON");
    let parsed: unknown;
    try {
      parsed = JSON.parse(values.json);
    } catch {
      throw new Error("INVALID_CURRENT_OBSERVATION_JSON");
    }
    parseImportedEvidenceIfClaimed(parsed);
  }

  timestamp(observation.observed_at, "OBSERVED_AT");
  timestamp(observation.recorded_at, "RECORDED_AT");
  optionalText(observation.probe_version, "PROBE_VERSION");
  optionalText(observation.source_hash, "SOURCE_HASH");
  optionalText(observation.crawl_hash, "CRAWL_HASH");
  optionalText(observation.evidence_ref, "EVIDENCE_REF");
  if (
    typeof observation.confidence !== "number" ||
    !Number.isFinite(observation.confidence) ||
    observation.confidence < 0 ||
    observation.confidence > 1
  )
    throw new Error("INVALID_CURRENT_OBSERVATION_CONFIDENCE");

  if (typeof observation.status !== "string" || !STATUSES.has(observation.status))
    throw new Error("INVALID_CURRENT_OBSERVATION_STATUS");
  optionalText(observation.superseded_by, "SUPERSEDED_BY");
  optionalText(observation.deprecated_reason, "DEPRECATED_REASON");
  if (observation.superseded_by !== null) assertBaselineCanonicalId(observation.superseded_by);
  if (
    (observation.status === "active" &&
      (observation.superseded_by !== null || observation.deprecated_reason !== null)) ||
    (observation.status === "superseded" &&
      (observation.superseded_by === null || observation.deprecated_reason !== null)) ||
    (observation.status === "deprecated" &&
      (observation.superseded_by !== null || observation.deprecated_reason === null))
  )
    throw new Error("INVALID_CURRENT_OBSERVATION_LIFECYCLE");

  const collectionStatus = Object.hasOwn(observation, "collection_status")
    ? observation.collection_status
    : null;
  if (
    collectionStatus !== null &&
    (typeof collectionStatus !== "string" || !COLLECTION_STATUSES.has(collectionStatus))
  )
    throw new Error("INVALID_CURRENT_OBSERVATION_COLLECTION_STATUS");
  for (const [value, label] of [
    [row.columns.ontology_version, "ONTOLOGY_VERSION"],
    [row.columns.run_id, "RUN_ID"],
    [row.columns.period, "PERIOD"],
  ] as const)
    text(value, label);
}
