import { describe, expect, it } from 'vitest';
import { formatSemVer, isScoreCompatible, majorOf, parseSemVer } from '../version.js';

describe('parseSemVer', () => {
  it('parses well-formed versions', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer('  2.0.0  ')).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('rejects non-semver strings', () => {
    expect(() => parseSemVer('1.0')).toThrow();
    expect(() => parseSemVer('v1.0.0')).toThrow();
    expect(() => parseSemVer('1.0.0-beta')).toThrow();
  });
});

describe('formatSemVer & majorOf', () => {
  it('round-trips', () => {
    expect(formatSemVer(parseSemVer('3.4.5'))).toBe('3.4.5');
  });
  it('extracts major', () => {
    expect(majorOf('2.7.1')).toBe('2');
  });
});

describe('isScoreCompatible', () => {
  it('same major → compatible', () => {
    expect(isScoreCompatible('1.0.0', '1.5.3')).toBe(true);
  });
  it('different major → incompatible', () => {
    expect(isScoreCompatible('1.5.3', '2.0.0')).toBe(false);
  });
});
