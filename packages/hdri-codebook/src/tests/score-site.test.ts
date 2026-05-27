import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCodebook } from '../parse.js';
import { scoreSite } from '../score-site.js';
import type { Codebook, SiteSignals } from '../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureYaml = fs.readFileSync(
  path.resolve(here, '../fixtures/engine-test-fixture.yaml'),
  'utf-8',
);

const fixture: { siteId: number; signals: SiteSignals }[] = JSON.parse(
  fs.readFileSync(path.resolve(here, '../fixtures/three-sites-signals.json'), 'utf-8'),
);

const cb: Codebook = parseCodebook(fixtureYaml);

describe('scoreSite — determinism & bounds', () => {
  it('produces identical output for identical input (stable run)', () => {
    const a = scoreSite(fixture[0]!.signals, cb);
    const b = scoreSite(fixture[0]!.signals, cb);
    expect(b).toEqual(a);
  });

  it('never produces scores outside [0, 100]', () => {
    for (const row of fixture) {
      const r = scoreSite(row.signals, cb);
      expect(r.overallScore).toBeGreaterThanOrEqual(0);
      expect(r.overallScore).toBeLessThanOrEqual(100);
      for (const d of r.dimensions) {
        if (d.score !== null) {
          expect(d.score).toBeGreaterThanOrEqual(0);
          expect(d.score).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('stamps codebook id and version into every result', () => {
    const r = scoreSite(fixture[0]!.signals, cb);
    expect(r.codebookId).toBe('hdri-demo-v1');
    expect(r.codebookVersion).toBe('2.1.0');
  });
});

describe('scoreSite — conditional missing policy with explicit collection status', () => {
  const condCb: Codebook = parseCodebook(`
id: cond-test
version: "1.0.0"
dimensions:
  - id: legal
    weight: 1.0
    indicators:
      - id: impressum
        inputKey: legal.impressum.present
        weight: 1.0
        rule: { type: bool, trueScore: 100, falseScore: 0 }
        missing:
          kind: conditional
          states:
            absent: zero
            unreachable: exclude
            forbidden: exclude
            not_applicable: skip
          default: zero
`);
  const emptySignals: SiteSignals = {};

  it('absent (no status, missing value) → score 0', () => {
    const r = scoreSite(emptySignals, condCb);
    expect(r.overallScore).toBe(0);
    expect(r.trace[0]?.note).toContain('conditional.absent → zero');
  });

  it('unreachable status → indicator excluded from dim roll-up', () => {
    const r = scoreSite(emptySignals, condCb, {
      signalStatuses: { 'legal.impressum.present': 'unreachable' },
    });
    // All indicators excluded → no signal counted → overallScore null
    expect(r.overallScore).toBeNull();
    expect(r.trace[0]?.note).toContain('conditional.unreachable → exclude');
  });

  it('not_applicable status → skipped (same effect as exclude in roll-up)', () => {
    const r = scoreSite(emptySignals, condCb, {
      signalStatuses: { 'legal.impressum.present': 'not_applicable' },
    });
    expect(r.overallScore).toBeNull();
    expect(r.trace[0]?.note).toContain('conditional.not_applicable → skip');
  });
});

describe('scoreSite — known-value regression', () => {
  it('site 1: full signals → perfect compliance, strong contactability', () => {
    const r = scoreSite(fixture[0]!.signals, cb);
    const compliance = r.dimensions.find((d) => d.dimensionId === 'compliance');
    expect(compliance?.score).toBe(100);

    // contactability: phones 3/3 * 0.5 + emails 2/2 * 0.3 + openingHours * 0.2 = 100
    const contact = r.dimensions.find((d) => d.dimensionId === 'contactability');
    expect(contact?.score).toBe(100);

    // digital_presence: meta true (100)*0.4 + cookie true (100)*0.6 = 100
    const digital = r.dimensions.find((d) => d.dimensionId === 'digital_presence');
    expect(digital?.score).toBe(100);

    expect(r.overallScore).toBe(100);
    expect(r.confidence).toBeCloseTo(1.0, 3);
  });

  it('site 2: partial compliance, thin contactability', () => {
    const r = scoreSite(fixture[1]!.signals, cb);
    // compliance: impressum true (100)*0.6 + datenschutz false (0)*0.4 = 60
    const compliance = r.dimensions.find((d) => d.dimensionId === 'compliance');
    expect(compliance?.score).toBe(60);

    // contactability: phones 1/3 ≈ 33.33 → *0.5 + emails 0 + openingHours null(0)*0.2 = 16.67
    const contact = r.dimensions.find((d) => d.dimensionId === 'contactability');
    expect(contact?.score).toBeCloseTo(16.67, 1);

    // digital_presence: meta false (0)*0.4 + cookie false (50)*0.6 = 30
    const digital = r.dimensions.find((d) => d.dimensionId === 'digital_presence');
    expect(digital?.score).toBe(30);
  });

  it('site 3: everything missing — skip/impute/zero policies combine', () => {
    const r = scoreSite(fixture[2]!.signals, cb);
    // compliance: both false → 0
    expect(r.dimensions.find((d) => d.dimensionId === 'compliance')?.score).toBe(0);

    // contactability: phones 0, emails 0, openingHours absent → all 0
    expect(r.dimensions.find((d) => d.dimensionId === 'contactability')?.score).toBe(0);

    // digital_presence: metaDescription null with kind=skip → dropped;
    // cookieBannerPresent null with kind=impute(50) → 50 with confidence 0.5
    const digital = r.dimensions.find((d) => d.dimensionId === 'digital_presence');
    expect(digital?.score).toBe(50);       // only cookie banner counted
    // Effective weight was reduced because meta was skipped:
    // dim weight 0.2 * coverage (0.6 / (0.4+0.6)) = 0.12
    expect(digital?.effectiveWeight).toBeCloseTo(0.12, 3);
    expect(digital?.confidence).toBeCloseTo(0.5, 3);
  });
});

describe('scoreSite — trace', () => {
  it('emits one trace row per indicator', () => {
    const r = scoreSite(fixture[0]!.signals, cb);
    const expected = cb.dimensions.reduce((s, d) => s + d.indicators.length, 0);
    expect(r.trace).toHaveLength(expected);
  });

  it('trace rows carry raw values and rule types', () => {
    const r = scoreSite(fixture[0]!.signals, cb);
    const impressumTrace = r.trace.find((t) => t.indicatorId === 'has_impressum');
    expect(impressumTrace?.rule).toBe('bool');
    expect(impressumTrace?.rawValue).toBe(true);
    expect(impressumTrace?.score).toBe(100);
  });

  it('skipped indicator shows score=null and confidence=0', () => {
    const r = scoreSite(fixture[2]!.signals, cb);
    const metaTrace = r.trace.find((t) => t.indicatorId === 'meta_description');
    expect(metaTrace?.score).toBeNull();
    expect(metaTrace?.confidence).toBe(0);
  });
});
