/**
 * Ontology validator.
 *
 * Validates signal paths, value types, and observations against a loaded
 * ontology. Designed for use both in pipeline gogols (fail-fast) and in
 * standalone test fixtures.
 */

import type { ObservationValueType } from '../types.js';
import type { SignalOntology } from './types.js';

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidationIssue = {
  readonly signal_path: string;
  readonly code:
    | 'unknown_signal'
    | 'deprecated_signal'
    | 'value_type_mismatch'
    | 'multiple_values_populated'
    | 'no_value_populated'
    | 'invalid_path_format';
  readonly message: string;
};

export type ValidationResult = {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
};

// ---------------------------------------------------------------------------
// Signal path format
// ---------------------------------------------------------------------------

/** Signal paths must be dot-separated lowercase segments: a.b.c */
const SIGNAL_PATH_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;

export const isValidPathFormat = (path: string): boolean =>
  SIGNAL_PATH_RE.test(path);

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export type ObservationCandidate = {
  readonly signal_path: string;
  readonly value_type: ObservationValueType;
  readonly value_bool: boolean | null;
  readonly value_num: number | null;
  readonly value_str: string | null;
  readonly value_json: string | null;
};

/**
 * Validates a single observation candidate against the ontology.
 *
 * Returns a list of issues. An empty list means the observation is valid.
 */
export const validateObservation = (
  obs: ObservationCandidate,
  ontology: SignalOntology,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Path format
  if (!isValidPathFormat(obs.signal_path)) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'invalid_path_format',
      message: `Signal path "${obs.signal_path}" does not match the required a.b.c format`,
    });
  }

  // Known signal
  const def = ontology.signals[obs.signal_path];
  if (!def) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'unknown_signal',
      message: `Signal path "${obs.signal_path}" is not in ontology v${ontology.version}`,
    });
    return issues;
  }

  // Deprecated
  if (def.deprecated_in != null) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'deprecated_signal',
      message: `Signal "${obs.signal_path}" was deprecated in ontology v${def.deprecated_in}`,
    });
  }

  // Value type match
  if (obs.value_type !== def.value_type) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'value_type_mismatch',
      message: `Expected value_type "${def.value_type}" for "${obs.signal_path}", got "${obs.value_type}"`,
    });
  }

  // Exactly one value_* populated
  const populated = [
    obs.value_bool !== null,
    obs.value_num !== null,
    obs.value_str !== null,
    obs.value_json !== null,
  ].filter(Boolean).length;

  if (populated === 0) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'no_value_populated',
      message: `No value_* column populated for "${obs.signal_path}"`,
    });
  } else if (populated > 1) {
    issues.push({
      signal_path: obs.signal_path,
      code: 'multiple_values_populated',
      message: `Multiple value_* columns populated for "${obs.signal_path}" (expected exactly 1)`,
    });
  }

  return issues;
};

/**
 * Validates a batch of observation candidates. Returns an aggregate result.
 */
export const validateObservations = (
  observations: readonly ObservationCandidate[],
  ontology: SignalOntology,
): ValidationResult => {
  const allIssues = observations.flatMap((obs) =>
    validateObservation(obs, ontology),
  );
  return {
    valid: allIssues.length === 0,
    issues: allIssues,
  };
};

/**
 * Validates that a signal path exists in the ontology and is not deprecated.
 * Lightweight check for use in signal mapping code.
 */
export const isActiveSignal = (
  path: string,
  ontology: SignalOntology,
): boolean => {
  const def = ontology.signals[path];
  return def != null && def.deprecated_in == null;
};
