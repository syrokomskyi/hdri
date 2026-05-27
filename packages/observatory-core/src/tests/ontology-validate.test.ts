import { describe, expect, it } from 'vitest';

import type { SignalOntology } from '../ontology/types.js';
import {
  isActiveSignal,
  isValidPathFormat,
  validateObservation,
  validateObservations,
  type ObservationCandidate,
} from '../ontology/validate.js';

// ---------------------------------------------------------------------------
// Minimal test ontology
// ---------------------------------------------------------------------------

const ontology: SignalOntology = {
  version: '1.0.0',
  signals: {
    'transport.tls.present': {
      label: 'TLS enabled',
      value_type: 'bool',
      introduced_in: '1.0.0',
      deprecated_in: null,
      supersedes: ['has_ssl'],
      stability: 'high',
    },
    'transport.http.status_code': {
      label: 'HTTP status code',
      value_type: 'num',
      introduced_in: '1.0.0',
      deprecated_in: null,
      supersedes: [],
      stability: 'high',
    },
    'transport.tls.version': {
      label: 'TLS version',
      value_type: 'str',
      introduced_in: '1.0.0',
      deprecated_in: null,
      supersedes: [],
      stability: 'high',
    },
    'analytics.tracking.old_platform.present': {
      label: 'Old deprecated tracker',
      value_type: 'bool',
      introduced_in: '1.0.0',
      deprecated_in: '1.1.0',
      supersedes: [],
      stability: 'low',
    },
  },
};

// ---------------------------------------------------------------------------
// Path format
// ---------------------------------------------------------------------------

describe('isValidPathFormat', () => {
  it('accepts valid paths', () => {
    expect(isValidPathFormat('transport.tls.present')).toBe(true);
    expect(isValidPathFormat('a.b')).toBe(true);
    expect(isValidPathFormat('audit.lighthouse.best_practices.score')).toBe(true);
  });

  it('rejects invalid paths', () => {
    expect(isValidPathFormat('single')).toBe(false);
    expect(isValidPathFormat('')).toBe(false);
    expect(isValidPathFormat('.leading.dot')).toBe(false);
    expect(isValidPathFormat('trailing.')).toBe(false);
    expect(isValidPathFormat('Has.Capitals')).toBe(false);
    expect(isValidPathFormat('has spaces.in.path')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateObservation
// ---------------------------------------------------------------------------

describe('validateObservation', () => {
  it('returns no issues for a valid bool observation', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.tls.present',
      value_type: 'bool',
      value_bool: true,
      value_num: null,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for a valid num observation', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.http.status_code',
      value_type: 'num',
      value_bool: null,
      value_num: 200,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for a valid num observation with value 0', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.http.status_code',
      value_type: 'num',
      value_bool: null,
      value_num: 0,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues).toHaveLength(0);
  });

  it('detects unknown signal path', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.nonexistent.signal',
      value_type: 'bool',
      value_bool: true,
      value_num: null,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('unknown_signal');
  });

  it('detects deprecated signal path', () => {
    const obs: ObservationCandidate = {
      signal_path: 'analytics.tracking.old_platform.present',
      value_type: 'bool',
      value_bool: false,
      value_num: null,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('deprecated_signal');
  });

  it('detects value_type mismatch', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.tls.present',
      value_type: 'num',
      value_bool: null,
      value_num: 1,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues.some((i) => i.code === 'value_type_mismatch')).toBe(true);
  });

  it('detects multiple values populated', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.tls.present',
      value_type: 'bool',
      value_bool: true,
      value_num: 1,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues.some((i) => i.code === 'multiple_values_populated')).toBe(true);
  });

  it('detects no value populated', () => {
    const obs: ObservationCandidate = {
      signal_path: 'transport.tls.present',
      value_type: 'bool',
      value_bool: null,
      value_num: null,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues.some((i) => i.code === 'no_value_populated')).toBe(true);
  });

  it('detects invalid path format', () => {
    const obs: ObservationCandidate = {
      signal_path: 'INVALID',
      value_type: 'bool',
      value_bool: true,
      value_num: null,
      value_str: null,
      value_json: null,
    };
    const issues = validateObservation(obs, ontology);
    expect(issues.some((i) => i.code === 'invalid_path_format')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateObservations (batch)
// ---------------------------------------------------------------------------

describe('validateObservations', () => {
  it('returns valid for all-good batch', () => {
    const batch: ObservationCandidate[] = [
      {
        signal_path: 'transport.tls.present',
        value_type: 'bool',
        value_bool: true,
        value_num: null,
        value_str: null,
        value_json: null,
      },
      {
        signal_path: 'transport.http.status_code',
        value_type: 'num',
        value_bool: null,
        value_num: 200,
        value_str: null,
        value_json: null,
      },
    ];
    const result = validateObservations(batch, ontology);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('accumulates issues from multiple observations', () => {
    const batch: ObservationCandidate[] = [
      {
        signal_path: 'unknown.path.one',
        value_type: 'bool',
        value_bool: true,
        value_num: null,
        value_str: null,
        value_json: null,
      },
      {
        signal_path: 'unknown.path.two',
        value_type: 'num',
        value_bool: null,
        value_num: 42,
        value_str: null,
        value_json: null,
      },
    ];
    const result = validateObservations(batch, ontology);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// isActiveSignal
// ---------------------------------------------------------------------------

describe('isActiveSignal', () => {
  it('returns true for active signal', () => {
    expect(isActiveSignal('transport.tls.present', ontology)).toBe(true);
  });

  it('returns false for deprecated signal', () => {
    expect(isActiveSignal('analytics.tracking.old_platform.present', ontology)).toBe(false);
  });

  it('returns false for unknown signal', () => {
    expect(isActiveSignal('nonexistent.signal.path', ontology)).toBe(false);
  });
});
