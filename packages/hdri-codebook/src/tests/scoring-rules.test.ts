import { describe, expect, it } from 'vitest';
import { applyRule, isMissing } from '../scoring-rules.js';
import type { ScoringRule } from '../types.js';

describe('bool rule', () => {
  const rule: ScoringRule = { type: 'bool', trueScore: 100, falseScore: 0 };

  it('maps true → trueScore, false → falseScore', () => {
    expect(applyRule(true, rule)).toBe(100);
    expect(applyRule(false, rule)).toBe(0);
  });

  it('coerces 0/1 and "true"/"false"', () => {
    expect(applyRule(1, rule)).toBe(100);
    expect(applyRule(0, rule)).toBe(0);
    expect(applyRule('true', rule)).toBe(100);
    expect(applyRule('false', rule)).toBe(0);
  });

  it('rejects arbitrary strings', () => {
    expect(() => applyRule('maybe', rule)).toThrow();
  });
});

describe('presence rule', () => {
  const rule: ScoringRule = { type: 'presence', presentScore: 100, absentScore: 0 };

  it('treats non-empty string as present', () => {
    expect(applyRule('Mo-Fr 08-18', rule)).toBe(100);
  });

  it('treats whitespace / empty / null as absent', () => {
    expect(applyRule('', rule)).toBe(0);
    expect(applyRule('   ', rule)).toBe(0);
    expect(applyRule(null, rule)).toBe(0);
  });
});

describe('countClamp rule', () => {
  const rule: ScoringRule = { type: 'countClamp', min: 0, max: 3 };

  it('clamps above max and below min', () => {
    expect(applyRule(5, rule)).toBe(100);
    expect(applyRule(-1, rule)).toBe(0);
  });

  it('interpolates linearly inside [min,max]', () => {
    expect(applyRule(0, rule)).toBe(0);
    expect(applyRule(3, rule)).toBe(100);
    expect(applyRule(1.5, rule)).toBe(50);
  });

  it('respects custom scoreAtMin/scoreAtMax', () => {
    const r: ScoringRule = { type: 'countClamp', min: 0, max: 10, scoreAtMin: 40, scoreAtMax: 80 };
    expect(applyRule(0, r)).toBe(40);
    expect(applyRule(10, r)).toBe(80);
    expect(applyRule(5, r)).toBe(60);
  });

  it('rejects non-finite numbers', () => {
    expect(() => applyRule(NaN, rule)).toThrow();
    expect(() => applyRule('oops', rule)).toThrow();
  });
});

describe('countClampInverse rule', () => {
  const rule: ScoringRule = { type: 'countClampInverse', min: 0, max: 5 };

  it('rewards lower values and penalizes higher ones', () => {
    expect(applyRule(0, rule)).toBe(100);
    expect(applyRule(5, rule)).toBe(0);
    expect(applyRule(2.5, rule)).toBe(50);
  });

  it('clamps above max and below min', () => {
    expect(applyRule(8, rule)).toBe(0);
    expect(applyRule(-1, rule)).toBe(100);
  });

  it('respects custom scoreAtMin/scoreAtMax', () => {
    const r: ScoringRule = { type: 'countClampInverse', min: 0, max: 10, scoreAtMin: 90, scoreAtMax: 30 };
    expect(applyRule(0, r)).toBe(90);
    expect(applyRule(10, r)).toBe(30);
    expect(applyRule(5, r)).toBe(60);
  });
});

describe('enum rule', () => {
  const rule: ScoringRule = {
    type: 'enum',
    cases: { A: 100, B: 60, C: 30 },
    defaultScore: 0,
  };

  it('maps known cases', () => {
    expect(applyRule('A', rule)).toBe(100);
    expect(applyRule('B', rule)).toBe(60);
  });

  it('falls back to defaultScore for unknown and null', () => {
    expect(applyRule('Z', rule)).toBe(0);
    expect(applyRule(null, rule)).toBe(0);
  });
});

describe('isMissing', () => {
  const bool: ScoringRule = { type: 'bool', trueScore: 100, falseScore: 0 };
  const pres: ScoringRule = { type: 'presence', presentScore: 100, absentScore: 0 };

  it('marks null and empty strings as missing for non-presence rules', () => {
    expect(isMissing(null, bool)).toBe(true);
    expect(isMissing('', bool)).toBe(true);
  });

  it('never flags missing for presence — the rule inspects it itself', () => {
    expect(isMissing(null, pres)).toBe(false);
    expect(isMissing('', pres)).toBe(false);
  });

  it('treats actual values as present', () => {
    expect(isMissing(true, bool)).toBe(false);
    expect(isMissing(0, bool)).toBe(false);
  });
});
