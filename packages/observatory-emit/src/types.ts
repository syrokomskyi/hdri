/**
 * Emit-bundle types — the formal handoff contract between a factory app and
 * the digital-observatory. Every factory app writes one emit-bundle per run;
 * the observatory reads bundles without ever touching the factory's SQLite.
 *
 * Format: manifest.json + observations.ndjson + asset-states.ndjson (opt) + evidence/
 * Wire format for observations is NDJSON in phase 0 (Parquet in phase 2 via
 * @org/observatory-vault when DuckDB is available).
 */

/** Discriminated union for the observations wire format used in this bundle. */
export type EmitFormat = 'ndjson-v1';

/**
 * Bundle manifest — written last (after observations are flushed) so that
 * bundle_hash and observation_count reflect the actual file.
 *
 * schema_version '1' — initial format (observations.ndjson only).
 * schema_version '2' — added asset-states.ndjson (asset_state_count, asset_states_hash).
 */
export type EmitManifest = {
  /** Increment when the shape changes incompatibly. */
  readonly schema_version: '1' | '2';
  readonly format: EmitFormat;

  /** Short id matching the pipeline app directory, e.g. "3-extract-profile". */
  readonly app_id: string;
  /** Semver of the collector app. */
  readonly collector_version: string;
  /** Semver of the ruleset (codebook / signal definitions). */
  readonly ruleset_version: string;
  /** Semver of the signal ontology used to validate observations. */
  readonly ontology_version: string;

  /** UUIDv7 — matches PipelineRun.run_id in observatory. */
  readonly run_id: string;
  /** Billing period, e.g. "2026-Q2". */
  readonly period: string;
  /** ISO 8601 timestamp of when commit() was called. */
  readonly emitted_at: string;

  /** Number of Observation records in the observations file. */
  readonly observation_count: number;
  /** Number of files written under evidence/. */
  readonly evidence_count: number;
  /**
   * SHA-256 hex of the observations.ndjson file content.
   * Null only if observation_count === 0 (empty bundle).
   */
  readonly bundle_hash: string | null;

  // ── Asset states (schema_version ≥ '2') ──────────────────────────────────
  /** Number of AssetStateRecord entries in asset-states.ndjson. Optional v1 compat. */
  readonly asset_state_count?: number;
  /**
   * SHA-256 hex of asset-states.ndjson file content.
   * Null only if asset_state_count === 0 or asset-state file is absent.
   */
  readonly asset_states_hash?: string | null;

  /**
   * Absolute path to the directory containing observations.ndjson and
   * asset-states.ndjson. When present, consumers should read data files
   * from this directory rather than the manifest directory.
   */
  readonly emit_dir?: string;
};

/** Parsed emit-bundle ready for consumption. */
export type EmitBundle = {
  readonly manifest: EmitManifest;
  readonly emitDir: string;
};

/** Per-bundle trackers — one per file stream (observations, asset-states). */
export type FileTracker = {
  readonly stream: import('node:fs').WriteStream;
  readonly hash: import('node:crypto').Hash;
  count: number;
};
