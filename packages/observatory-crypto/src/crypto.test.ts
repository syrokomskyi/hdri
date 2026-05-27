import { describe, expect, it } from 'vitest';
import type { Observation } from '@org/observatory-core';
import { canonicalize } from './canonicalize.js';
import { generateSigningKey, signObservation } from './sign.js';
import { verifyObservation, verifyObservations } from './verify.js';
import type { SigningKeyConfig } from './types.js';

// ---------------------------------------------------------------------------
// RFC 8785 canonicalization
// ---------------------------------------------------------------------------

describe('canonicalize', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });

  it('handles nested objects and arrays', () => {
    const result = canonicalize({ b: [3, 1, 2], a: { y: 'hi', x: 0 } });
    expect(result).toBe('{"a":{"x":0,"y":"hi"},"b":[3,1,2]}');
  });

  it('handles null, booleans, and numbers', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(3.14)).toBe('3.14');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize(NaN)).toThrow('non-finite');
    expect(() => canonicalize(Infinity)).toThrow('non-finite');
  });

  it('produces deterministic output for the same logical value', () => {
    const a = canonicalize({ x: 1, y: 2 });
    const b = canonicalize({ y: 2, x: 1 });
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Sign + verify round-trip
// ---------------------------------------------------------------------------

const FIXTURE_OBS: Observation = {
  observation_id: '01909a1c-d3e0-7000-8000-000000000001',
  asset_id: 'asset-abc',
  crawl_id: 'crawl-001',
  signal_path: 'web.presence.online',
  value_bool: true,
  value_num: null,
  value_str: null,
  value_json: null,
  value_type: 'bool',
  observed_at: '2026-04-01T00:00:00.000Z',
  recorded_at: '2026-04-01T00:01:00.000Z',
  collector_version: '0.0.1',
  probe_version: null,
  ruleset_version: '1.0.0',
  source_hash: null,
  crawl_hash: null,
  evidence_ref: null,
  confidence: 1,
  status: 'active',
  superseded_by: null,
  deprecated_reason: null,
};

function makeKey(): SigningKeyConfig {
  const { privateKeyPem, publicKeyPem } = generateSigningKey();
  return {
    privateKeyPem,
    publicKeyPem,
    signingKeyId: 'test-key-2026',
    collectorId: 'test-pc',
  };
}

describe('sign + verify', () => {
  it('round-trip: signed observation verifies correctly', () => {
    const key = makeKey();
    const signed = signObservation(FIXTURE_OBS, key);

    expect(signed.signature).toBeTruthy();
    expect(signed.signing_key_id).toBe('test-key-2026');
    expect(signed.collector_id).toBe('test-pc');

    const vk = { publicKeyPem: key.publicKeyPem, signingKeyId: key.signingKeyId };
    expect(verifyObservation(signed, vk)).toBe(true);
  });

  it('rejects a tampered value', () => {
    const key = makeKey();
    const signed = signObservation(FIXTURE_OBS, key);
    const tampered = { ...signed, value_bool: false };

    const vk = { publicKeyPem: key.publicKeyPem, signingKeyId: key.signingKeyId };
    expect(verifyObservation(tampered, vk)).toBe(false);
  });

  it('rejects a wrong public key', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const signed = signObservation(FIXTURE_OBS, key1);

    const vk = { publicKeyPem: key2.publicKeyPem, signingKeyId: key1.signingKeyId };
    expect(verifyObservation(signed, vk)).toBe(false);
  });

  it('rejects a mismatched signing_key_id', () => {
    const key = makeKey();
    const signed = signObservation(FIXTURE_OBS, key);

    const vk = { publicKeyPem: key.publicKeyPem, signingKeyId: 'other-key-2026' };
    expect(verifyObservation(signed, vk)).toBe(false);
  });

  it('verifyObservations returns indices of failures', () => {
    const key = makeKey();
    const good = signObservation(FIXTURE_OBS, key);
    const tampered = { ...signObservation(FIXTURE_OBS, key), value_bool: false };

    const vk = { publicKeyPem: key.publicKeyPem, signingKeyId: key.signingKeyId };
    const failed = verifyObservations([good, tampered, good], vk);
    expect(failed).toEqual([1]);
  });

  it('signature does not include the signing fields themselves', () => {
    const key = makeKey();
    const s1 = signObservation(FIXTURE_OBS, key);
    // Re-sign with same key but different collector_id — base payload is identical,
    // so the signature should differ only because signed_at differs, but the
    // base observation payload canonicalization must be the same.
    const key2 = { ...key, collectorId: 'other-pc' };
    const s2 = signObservation(FIXTURE_OBS, key2);

    // Both should verify against the same public key
    const vk = { publicKeyPem: key.publicKeyPem, signingKeyId: key.signingKeyId };
    expect(verifyObservation(s1, vk)).toBe(true);
    expect(verifyObservation(s2, vk)).toBe(true);
  });
});
