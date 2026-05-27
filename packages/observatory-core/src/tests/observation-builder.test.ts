import { describe, expect, it } from 'vitest';

import { boolObs, jsonObs, numObs, strObs, type ObservationInit } from '../observation-builder.js';

const base: ObservationInit = {
  asset_id: 'da-test',
  crawl_id: 'run_test',
  signal_path: 'transport.tls.present',
  observed_at: '2025-01-15T10:00:00Z',
  collector_version: 'test@0.1.0',
  ruleset_version: 'signal-ontology@1.0.0',
};

describe('boolObs', () => {
  it('creates observation with only value_bool populated', () => {
    const obs = boolObs(base, true);
    expect(obs.value_type).toBe('bool');
    expect(obs.value_bool).toBe(true);
    expect(obs.value_num).toBeNull();
    expect(obs.value_str).toBeNull();
    expect(obs.value_json).toBeNull();
    expect(obs.status).toBe('active');
    expect(obs.confidence).toBe(1.0);
  });

  it('creates observation with false value', () => {
    const obs = boolObs(base, false);
    expect(obs.value_bool).toBe(false);
  });
});

describe('numObs', () => {
  it('creates observation with only value_num populated', () => {
    const obs = numObs({ ...base, signal_path: 'transport.http.status_code' }, 200);
    expect(obs.value_type).toBe('num');
    expect(obs.value_num).toBe(200);
    expect(obs.value_bool).toBeNull();
    expect(obs.value_str).toBeNull();
    expect(obs.value_json).toBeNull();
  });

  it('preserves numeric zero (not null)', () => {
    const obs = numObs({ ...base, signal_path: 'transport.http.latency_ms' }, 0);
    expect(obs.value_num).toBe(0);
    expect(obs.value_type).toBe('num');
  });
});

describe('strObs', () => {
  it('creates observation with only value_str populated', () => {
    const obs = strObs({ ...base, signal_path: 'transport.tls.version' }, 'TLSv1.3');
    expect(obs.value_type).toBe('str');
    expect(obs.value_str).toBe('TLSv1.3');
    expect(obs.value_bool).toBeNull();
    expect(obs.value_num).toBeNull();
    expect(obs.value_json).toBeNull();
  });
});

describe('jsonObs', () => {
  it('creates observation with only value_json populated', () => {
    const obs = jsonObs({ ...base, signal_path: 'audit.lighthouse.details' }, { scores: [1, 2] });
    expect(obs.value_type).toBe('json');
    expect(obs.value_json).toBe('{"scores":[1,2]}');
    expect(obs.value_bool).toBeNull();
    expect(obs.value_num).toBeNull();
    expect(obs.value_str).toBeNull();
  });
});

describe('common observation fields', () => {
  it('generates a unique observation_id', () => {
    const a = boolObs(base, true);
    const b = boolObs(base, true);
    expect(a.observation_id).not.toBe(b.observation_id);
  });

  it('copies init fields correctly', () => {
    const obs = boolObs(base, true);
    expect(obs.asset_id).toBe('da-test');
    expect(obs.crawl_id).toBe('run_test');
    expect(obs.signal_path).toBe('transport.tls.present');
    expect(obs.observed_at).toBe('2025-01-15T10:00:00Z');
    expect(obs.collector_version).toBe('test@0.1.0');
    expect(obs.ruleset_version).toBe('signal-ontology@1.0.0');
  });

  it('uses custom confidence when provided', () => {
    const obs = boolObs({ ...base, confidence: 0.8 }, true);
    expect(obs.confidence).toBe(0.8);
  });

  it('uses custom evidence_ref when provided', () => {
    const obs = boolObs({ ...base, evidence_ref: 'evidence/crawl_id=x/da_test.html.gz' }, true);
    expect(obs.evidence_ref).toBe('evidence/crawl_id=x/da_test.html.gz');
  });
});
