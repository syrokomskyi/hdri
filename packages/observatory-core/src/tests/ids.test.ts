import { describe, expect, it } from 'vitest';

import { deriveAssetId, derivePublicAssetId, newId } from '../ids.js';

describe('newId', () => {
  it('generates a UUID string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

describe('deriveAssetId', () => {
  it('is deterministic for the same domain', () => {
    expect(deriveAssetId('example.de')).toBe(deriveAssetId('example.de'));
  });

  it('starts with da- prefix', () => {
    expect(deriveAssetId('example.de')).toMatch(/^da-[0-9a-f]{32}$/);
  });

  it('differs for different domains', () => {
    expect(deriveAssetId('a.de')).not.toBe(deriveAssetId('b.de'));
  });
});

describe('derivePublicAssetId', () => {
  it('is deterministic for the same inputs', () => {
    const a = derivePublicAssetId('da-abc', 'salt123');
    const b = derivePublicAssetId('da-abc', 'salt123');
    expect(a).toBe(b);
  });

  it('starts with pub_ prefix', () => {
    expect(derivePublicAssetId('da-abc', 'salt')).toMatch(/^pub_[0-9a-f]{16}$/);
  });

  it('differs for different salts', () => {
    const a = derivePublicAssetId('da-abc', 'salt1');
    const b = derivePublicAssetId('da-abc', 'salt2');
    expect(a).not.toBe(b);
  });
});
