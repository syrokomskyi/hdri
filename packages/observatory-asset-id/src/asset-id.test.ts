import { describe, expect, it } from 'vitest';
import { mintAssetId, newId } from './ids.js';
import { normalizeAssetDomain, normalizeAssetDomains, toRegistrableDomain } from './normalize.js';

describe('normalizeAssetDomain', () => {
  it('extracts eTLD+1 from full URL', () => {
    const r = normalizeAssetDomain('https://shop.example.co.uk/products?q=1');
    expect(r?.normalized).toBe('example.co.uk');
    expect(r?.hostname).toBe('shop.example.co.uk');
  });

  it('extracts eTLD+1 from subdomain hostname', () => {
    expect(normalizeAssetDomain('www.maler-mustermann.de')?.normalized).toBe('maler-mustermann.de');
  });

  it('handles bare registrable domain', () => {
    expect(normalizeAssetDomain('example.de')?.normalized).toBe('example.de');
  });

  it('lowercases the result', () => {
    expect(normalizeAssetDomain('EXAMPLE.DE')?.normalized).toBe('example.de');
  });

  it('returns null for IP address', () => {
    expect(normalizeAssetDomain('192.168.1.1')).toBeNull();
  });

  it('returns null for localhost', () => {
    expect(normalizeAssetDomain('localhost')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeAssetDomain('')).toBeNull();
  });

  it('returns null for nonsense string', () => {
    expect(normalizeAssetDomain('not-a-domain')).toBeNull();
  });

  it('handles http without www', () => {
    expect(normalizeAssetDomain('http://example.de')?.normalized).toBe('example.de');
  });
});

describe('normalizeAssetDomains', () => {
  it('maps valid inputs and drops invalid ones', () => {
    const map = normalizeAssetDomains([
      'https://shop.example.de',
      'localhost',
      'www.other.co.uk',
    ]);
    expect(map.size).toBe(2);
    expect(map.get('https://shop.example.de')).toBe('example.de');
    expect(map.get('www.other.co.uk')).toBe('other.co.uk');
    expect(map.has('localhost')).toBe(false);
  });
});

describe('toRegistrableDomain', () => {
  it('returns eTLD+1 string directly', () => {
    expect(toRegistrableDomain('sub.example.de')).toBe('example.de');
  });

  it('returns null for localhost', () => {
    expect(toRegistrableDomain('localhost')).toBeNull();
  });
});

describe('mintAssetId', () => {
  it('returns a valid UUIDv7 string', () => {
    const id = mintAssetId();
    // UUIDv7: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('mints unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, mintAssetId));
    expect(ids.size).toBe(100);
  });

  it('IDs are lexicographically ordered over time', () => {
    const ids = Array.from({ length: 10 }, mintAssetId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

describe('newId', () => {
  it('returns a valid UUIDv4 string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
