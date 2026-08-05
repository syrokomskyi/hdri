/*
<MODULE_CONTRACT>
<purpose>Re-exports essential types, utilities, and functions for asset management and lifecycle event handling.</purpose>
<non-goals>
  <item>Does not implement specific business logic or application-specific functionality.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial setup with type and utility re-exports for asset and lifecycle management.</item>
  <item>Remove factory-utils re-exports — moved to @syrokomskyi/factory-core.</item>
  <item>Consolidate mintAssetId and IdentityRequest from @syrokomskyi/observatory-asset-id.</item>
</CHANGE_SUMMARY>
*/

// Types
export type {
  AssetState,
  AssetStateMapping,
  AssetStateRecord,
  BordbuchEvent,
  Cohort,
  DeprecatedReason,
  EvidenceRef,
  GewerkGroup,
  NarrativeAnchor,
  Observation,
  ObservationStatus,
  ObservationValueType,
  PipelineRun,
  PipelineStage,
  Score,
  SignalCollectionStatus,
} from "./types.js";

// IDs
export {
  deriveAssetId,
  derivePublicAssetId,
  mintAssetId,
  newId,
  parsePeriod,
  type IdentityRequest,
  type ParsedPeriod,
} from "./ids.js";

// Hashing
export { computationHash, sha256, sha256Json } from "./hashing.js";

// Business lifecycle events (WP13)
export {
  LIFECYCLE_EVENT_TYPES,
  assertValidLifecycleEvent,
  reconstructAssetHistory,
  validateLifecycleEvent,
} from "./lifecycle.js";
export type {
  AssetLifecycleEvent,
  AssetTimeline,
  LifecycleEventSource,
  LifecycleEventType,
  LifecycleStatus,
} from "./lifecycle.js";

// Observation builder
export { boolObs, jsonObs, numObs, strObs, type ObservationInit } from "./observation-builder.js";

// Signal map (ext_* → ontology bridge)
export {
  AXE_SIGNAL_MAP,
  EXT_SIGNAL_MAP,
  axeSignalByPath,
  createSignalMap,
  extSignalsByTable,
  extSignalByPath,
  type AxeSignalMapping,
  type ExtSignalMapping,
  type SignalMap,
  type SignalMapIssue,
} from "./signal-map.js";

// Ontology (re-export convenience subset; full ontology available via "@syrokomskyi/observatory-core/ontology")
export type { SignalOntology, SignalDefinition } from "./ontology/types.js";
export { isActiveSignal, validateObservation, validateObservations } from "./ontology/validate.js";
export { parseOntology, readOntologyFile } from "./ontology/loader.js";

// Factory utilities moved to @syrokomskyi/factory-core

// Value invariant (owned by value.ts)
export type { ObservationValueFields } from "./value.js";
export { countPopulatedValues, makeValueFields } from "./value.js";

export { classifyLivenessOutcome, deriveAvailabilityTransition, LIVENESS_OUTCOME_POLICY_VERSION, withAvailabilityOntologyV2 } from "./availability.js";
export type { AvailabilityTransition, LivenessOutcome, RawLivenessAttempt, WebsiteAvailabilityEvent, WebsitePanelState } from "./availability.js";
export { canCommitCheckpoint, observationKey } from "./streaming.js";
export type { ObservationKeyInput, StreamCheckpoint } from "./streaming.js";
