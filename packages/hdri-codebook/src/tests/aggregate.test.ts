import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aggregateCohort, type ScoredSite } from '../aggregate.js';
import { parseCodebook } from '../parse.js';
import { scoreSite } from '../score-site.js';
import type { SiteSignals, SiteStratum } from '../aggregate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cb = parseCodebook(
  fs.readFileSync(path.resolve(here, '../fixtures/engine-test-fixture.yaml'), 'utf-8'),
);

type FixtureRow = { siteId: number; stratum: SiteStratum; signals: SiteSignals };
const rows: FixtureRow[] = JSON.parse(
  fs.readFileSync(path.resolve(here, '../fixtures/three-sites-signals.json'), 'utf-8'),
);

const scored: ScoredSite[] = rows.map((r) => ({
  siteId: r.siteId,
  stratum: r.stratum,
  score: scoreSite(r.signals, cb),
}));

const dimensionIds = cb.dimensions.map((d) => d.id);

describe('aggregateCohort', () => {
  it('reports total and cohort summaries', () => {
    const report = aggregateCohort(scored, dimensionIds);
    expect(report.total).toBe(3);
    expect(report.cohort.overall?.n).toBe(3);
    // Values 100, ~42, ~10 (approx) — just sanity range
    expect(report.cohort.overall?.min).toBeLessThan(20);
    expect(report.cohort.overall?.max).toBe(100);
  });

  it('includes every codebook dimension even if zero sites scored on it', () => {
    const report = aggregateCohort(scored, [...dimensionIds, 'ghost_dim']);
    expect(Object.keys(report.cohort.perDimension).sort()).toEqual(
      ['compliance', 'contactability', 'digital_presence', 'ghost_dim', 'self_report'].sort(),
    );
    expect(report.cohort.perDimension.ghost_dim).toBeNull();
  });

  it('slices by a stratum axis when requested', () => {
    const report = aggregateCohort(scored, dimensionIds, ['gewerkGroup']);
    expect(report.byAxis.gewerkGroup).toBeDefined();
    const slices = report.byAxis.gewerkGroup!;
    // Two groups: BauAusbau (sites 1,2) and Nahrung (site 3)
    expect(slices).toHaveLength(2);

    const bau = slices.find((s) => s.group?.gewerkGroup === 'BauAusbau');
    const nahrung = slices.find((s) => s.group?.gewerkGroup === 'Nahrung');
    expect(bau?.overall?.n).toBe(2);
    expect(nahrung?.overall?.n).toBe(1);
    expect(bau?.overall?.p50).toBeGreaterThan(nahrung?.overall?.p50 ?? 0);
  });

  it('slices are sorted deterministically by group key', () => {
    const report = aggregateCohort(scored, dimensionIds, ['gewerkGroup']);
    const keys = report.byAxis.gewerkGroup!.map((s) => s.group?.gewerkGroup);
    expect(keys).toEqual([...keys].sort());
  });

  it('supports multiple axes independently (not crossed)', () => {
    const report = aggregateCohort(scored, dimensionIds, ['gewerkGroup', 'bundesland']);
    expect(Object.keys(report.byAxis).sort()).toEqual(['bundesland', 'gewerkGroup']);
  });

  it('quantile sanity on small sample', () => {
    // With 3 values the overall percentiles are interpolated
    const report = aggregateCohort(scored, dimensionIds);
    expect(report.cohort.overall?.p10).toBeLessThanOrEqual(report.cohort.overall?.p25 ?? 0);
    expect(report.cohort.overall?.p25).toBeLessThanOrEqual(report.cohort.overall?.p50 ?? 0);
    expect(report.cohort.overall?.p50 ?? 0).toBeLessThanOrEqual(report.cohort.overall?.p75 ?? 0);
    expect(report.cohort.overall?.p75 ?? 0).toBeLessThanOrEqual(report.cohort.overall?.p90 ?? 0);
  });
});
