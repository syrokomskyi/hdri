import { describe, expect, it } from 'vitest';

import { computationHash, sha256, sha256Json } from '../hashing.js';

describe('sha256', () => {
  it('produces consistent hash for the same input', () => {
    const a = sha256('hello');
    const b = sha256('hello');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('sha256Json', () => {
  it('is deterministic regardless of key order', () => {
    const a = sha256Json({ b: 2, a: 1 });
    const b = sha256Json({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('handles nested objects with stable key order', () => {
    const a = sha256Json({ x: { b: 2, a: 1 }, y: 3 });
    const b = sha256Json({ y: 3, x: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it('handles arrays in order', () => {
    const a = sha256Json([1, 2, 3]);
    const b = sha256Json([1, 2, 3]);
    expect(a).toBe(b);
    expect(a).not.toBe(sha256Json([3, 2, 1]));
  });

  it('handles null and primitives', () => {
    expect(sha256Json(null)).toBe(sha256Json(null));
    expect(sha256Json(42)).toBe(sha256Json(42));
    expect(sha256Json('text')).toBe(sha256Json('text'));
    expect(sha256Json(true)).toBe(sha256Json(true));
  });
});

describe('computationHash', () => {
  it('sorts observation IDs for determinism', () => {
    const a = computationHash('v1.0.0', ['obs-c', 'obs-a', 'obs-b']);
    const b = computationHash('v1.0.0', ['obs-a', 'obs-b', 'obs-c']);
    expect(a).toBe(b);
  });

  it('differs for different codebook versions', () => {
    const ids = ['obs-1', 'obs-2'];
    expect(computationHash('v1.0.0', ids)).not.toBe(computationHash('v2.0.0', ids));
  });

  it('differs for different observation sets', () => {
    expect(computationHash('v1', ['a'])).not.toBe(computationHash('v1', ['b']));
  });
});
