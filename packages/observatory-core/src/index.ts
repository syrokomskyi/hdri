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
} from './types.js';

// IDs
export {
  deriveAssetId,
  derivePublicAssetId,
  newId,
  parsePeriod,
  type ParsedPeriod,
} from './ids.js';

// Hashing
export { computationHash, sha256, sha256Json } from './hashing.js';

// Observation builder
export { boolObs, jsonObs, numObs, strObs, type ObservationInit } from './observation-builder.js';

// Signal map (ext_* → ontology bridge)
export {
  AXE_SIGNAL_MAP,
  EXT_SIGNAL_MAP,
  axeSignalByPath,
  extSignalsByTable,
  extSignalByPath,
  type AxeSignalMapping,
  type ExtSignalMapping,
} from './signal-map.js';

// Ontology (re-export convenience subset; full ontology available via "@org/observatory-core/ontology")
export type { SignalOntology, SignalDefinition } from './ontology/types.js';
export { isActiveSignal, validateObservation, validateObservations } from './ontology/validate.js';
export { parseOntology, readOntologyFile } from './ontology/loader.js';

// Factory utilities (shared across hdri-factory phases)
export {
  createFactoryRelativePathConverter,
  getFactoryRootDir,
  getFactoryPaths,
  getUpstreamOutputRoot,
} from './factory-utils.js';
