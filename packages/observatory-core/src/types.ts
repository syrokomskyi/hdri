/**
 * observatory-core — canonical type definitions.
 *
 * These types model the Digital Observatory data architecture as described in
 * spec/011-020/13-digital-observatory/1-concept.md. They cover the four
 * layers: Evidence, Observations, Interpretations, and Narrative.
 *
 * All types are designed for append-only, immutable data. Fields use the
 * exact names from the canonical spec to ensure 1:1 mapping to Parquet
 * columns and DuckDB views.
 */

// ---------------------------------------------------------------------------
// Value types for observations
// ---------------------------------------------------------------------------

/** Allowed observation value types matching the Parquet column set. */
export type ObservationValueType = 'bool' | 'num' | 'str' | 'json';

// ---------------------------------------------------------------------------
// Layer 1: Evidence
// ---------------------------------------------------------------------------

/**
 * Reference to a piece of evidence in content-addressed storage.
 * Evidence itself is opaque bytes; only the reference is stored in
 * observations.
 */
export type EvidenceRef = {
  /** Path inside evidence storage, e.g. "evidence/crawl_id={uuid}/{asset_id}.html.gz" */
  readonly path: string;
  /** SHA-256 of the raw content (optional, for content-addressed dedup). */
  readonly content_hash?: string;
};

// ---------------------------------------------------------------------------
// Layer 2: Observations — immutable journal of facts
// ---------------------------------------------------------------------------

/**
 * Observation status. Observations are never deleted; they transition
 * from active to superseded or deprecated.
 */
export type ObservationStatus = 'active' | 'superseded' | 'deprecated';

/**
 * Signal collection status — independent of the lifecycle status above.
 *
 * Set on observations whose value could not be collected for a deterministic
 * reason. `null` (default) means the value was collected normally; the
 * `value_*` columns reflect the actual signal.
 *
 * Used by the scorer's `conditional` missing policy to apply the right
 * fallback (e.g. 'unreachable' may exclude the indicator while 'absent'
 * scores zero).
 */
export type SignalCollectionStatus =
  | 'absent'
  | 'unreachable'
  | 'forbidden'
  | 'not_applicable';

/** Reason for deprecation. */
export type DeprecatedReason =
  | 'domain_parked'
  | 'false_positive'
  | 'pipeline_error'
  | string;

/**
 * A single atomic observation — one signal value for one asset at one point
 * in time. This is the single source of truth for the entire system.
 */
export type Observation = {
  // -- Identification
  /** UUIDv7 — lexicographically sortable by time. */
  readonly observation_id: string;
  /** Stable asset identity (never changes). */
  readonly asset_id: string;
  /** Pipeline run that produced this observation. */
  readonly crawl_id: string;

  // -- Signal (ontology-backed)
  /** Semantic signal path, e.g. "privacy.consent.banner.present". */
  readonly signal_path: string;
  readonly value_bool: boolean | null;
  readonly value_num: number | null;
  readonly value_str: string | null;
  readonly value_json: string | null;
  /** Discriminator matching exactly one populated value_* column. */
  readonly value_type: ObservationValueType;

  // -- Bitemporality
  /** When the signal was true in the world (crawl date). */
  readonly observed_at: string;
  /** When we recorded this fact (transaction time). */
  readonly recorded_at: string;

  // -- Provenance
  readonly collector_version: string;
  readonly probe_version: string | null;
  readonly ruleset_version: string;
  readonly source_hash: string | null;
  readonly crawl_hash: string | null;
  readonly evidence_ref: string | null;

  // -- Quality
  /** 0.0–1.0 detector confidence. */
  readonly confidence: number;

  /**
   * Why the value_* columns are null, when applicable. `null` (default) means
   * the signal was collected normally. Non-null indicates a deterministic
   * collection failure used by the codebook's `conditional` missing policy.
   */
  readonly collection_status?: SignalCollectionStatus | null;

  // -- Lifecycle
  readonly status: ObservationStatus;
  readonly superseded_by: string | null;
  readonly deprecated_reason: DeprecatedReason | null;
};

// ---------------------------------------------------------------------------
// Pipeline runs — provenance table
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 't0-harvest'
  | 't1-liveness'
  | 't2-profile'
  | 't3-scoring'
  | 't4-audit-axe'
  | 't4-audit-lighthouse'
  | string;

export type PipelineRun = {
  readonly run_id: string;
  readonly pipeline_stage: PipelineStage;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly collector_version: string;
  readonly ruleset_version: string;
  readonly ontology_version: string;
  readonly input_hash: string;
  readonly operator: string;
  readonly notes: string | null;
};

// ---------------------------------------------------------------------------
// Asset states — SCD-2
// ---------------------------------------------------------------------------

export type GewerkGroup =
  | 'shk'
  | 'elektro'
  | 'dach'
  | 'maler'
  | 'tischler'
  | 'metallbau'
  | 'kfz'
  | 'bau'
  | string;

export type AssetState = {
  readonly asset_id: string;
  /** Start of this state version. */
  readonly valid_from: string;
  /** NULL = current version. */
  readonly valid_to: string | null;
  readonly domain: string;
  readonly gewerk_group: GewerkGroup;
  /** ISO 3166-2 state code, e.g. "DE-BW". */
  readonly bundesland: string;
  readonly postal_code: string | null;
  readonly classifier_version: string;
};

/**
 * Asset state record for the emit-bundle wire format (NDJSON).
 * Snapshot of asset metadata at emission time — no SCD-2 timestamps,
 * the bundle itself is the version marker.
 */
export type AssetStateRecord = {
  readonly asset_id: string;
  readonly domain: string;
  readonly gewerk_group: string | null;
  readonly hwo_uid: string | null;
  readonly hwo_provenance: string | null;
  readonly bundesland: string | null;
  readonly gemeinde: string | null;
  /**
   * HWO mappings (e.g. destatis_group) for this asset.
   * Empty array if none registered.
   */
  readonly mappings: readonly AssetStateMapping[];
};

export type AssetStateMapping = {
  readonly mapping_system: string;
  readonly target_code: string;
  readonly target_label: string | null;
  readonly source: string;
};

// ---------------------------------------------------------------------------
// Layer 3: Interpretations — versioned, recomputable
// ---------------------------------------------------------------------------

export type Score = {
  readonly score_id: string;
  readonly asset_id: string;
  readonly codebook_version: string;
  readonly scored_at: string;
  readonly period: string;
  readonly cohort_id: string;
  readonly score_overall: number | null;
  /** Dimension scores keyed by dimension id. */
  readonly dimension_scores: Readonly<Record<string, number | null>>;
  /** JSON array of observation_id values used to compute this score. */
  readonly input_observation_ids: readonly string[];
  /** SHA-256(scorer code + input observations) for theory reconstruction. */
  readonly computation_hash: string;
  readonly superseded_by: string | null;
};

export type Cohort = {
  readonly cohort_id: string;
  readonly created_at: string;
  readonly scoring_model_version: string;
  /** JSON filter criteria: gewerk_group, bundesland, liveness, etc. */
  readonly filter_criteria: string;
  readonly sample_size: number;
  /** Deterministic seed for reproducible sampling. */
  readonly sampling_seed: number;
};

export type NarrativeAnchor = {
  readonly anchor_id: string;
  readonly pattern_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly gewerk_group: string;
  readonly bundesland: string;
  /** JSON object with pattern-specific parameters. */
  readonly parameters: string;
  readonly confidence: number;
  readonly supporting_asset_count: number;
  readonly codebook_version: string;
  readonly computed_at: string;
  readonly superseded_by: string | null;
};

// ---------------------------------------------------------------------------
// Bordbuch (pipeline event log)
// ---------------------------------------------------------------------------

export type BordbuchEvent = {
  readonly event_id: string;
  readonly run_id: string;
  readonly timestamp: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
  readonly context: string | null;
};
