import type { SiteScore } from './types.js';

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * Minimal stratification record — `hdri-codebook` doesn't care about the
 * exact meaning of these labels, only that they are strings that can be
 * grouped on. Adding a new axis (e.g. citySize) requires no code change.
 */
export type SiteStratum = Readonly<{
  siteId: string | number;
  [axis: string]: string | number;
}>;

export type ScoredSite = {
  siteId: string | number;
  stratum?: SiteStratum;
  score: SiteScore;
};

// ---------------------------------------------------------------------------
// Stat helpers (deterministic, pure)
// ---------------------------------------------------------------------------

const sortedCopy = (xs: readonly number[]): number[] =>
  xs.slice().sort((a, b) => a - b);

/**
 * Quantile via linear interpolation (type 7 — R default, most common).
 * q must be in [0, 1]. Returns NaN for empty arrays; callers filter.
 */
const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return NaN;
  const sorted = sortedCopy(xs);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo] as number;
  const frac = pos - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
};

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Summary record
// ---------------------------------------------------------------------------

export type ScoreSummary = {
  n: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
};

const summarize = (values: readonly number[]): ScoreSummary | null => {
  if (values.length === 0) return null;
  return {
    n: values.length,
    mean: round2(mean(values)),
    p10: round2(quantile(values, 0.1)),
    p25: round2(quantile(values, 0.25)),
    p50: round2(quantile(values, 0.5)),
    p75: round2(quantile(values, 0.75)),
    p90: round2(quantile(values, 0.9)),
    min: round2(Math.min(...values)),
    max: round2(Math.max(...values)),
  };
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type CohortAggregate = {
  /** Null if scoped to a single group/axis value. */
  group?: Readonly<Record<string, string | number>>;
  overall: ScoreSummary | null;
  /** One entry per dimension id present in the codebook. */
  perDimension: Readonly<Record<string, ScoreSummary | null>>;
};

export type CohortReport = {
  total: number;
  /** Aggregate over all scored sites (regardless of stratum). */
  cohort: CohortAggregate;
  /** Aggregates sliced by each requested axis (e.g. "gewerkGroup"). */
  byAxis: Readonly<Record<string, readonly CohortAggregate[]>>;
};

const collectNumeric = (
  scored: readonly ScoredSite[],
  extract: (s: ScoredSite) => number | null,
): number[] => {
  const out: number[] = [];
  for (const s of scored) {
    const v = extract(s);
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
};

const aggregateSlice = (
  scored: readonly ScoredSite[],
  dimensionIds: readonly string[],
  group?: Readonly<Record<string, string | number>>,
): CohortAggregate => {
  const overallValues = collectNumeric(scored, (s) => s.score.overallScore);
  const perDimension: Record<string, ScoreSummary | null> = {};
  for (const dimId of dimensionIds) {
    const values = collectNumeric(
      scored,
      (s) => s.score.dimensions.find((d) => d.dimensionId === dimId)?.score ?? null,
    );
    perDimension[dimId] = summarize(values);
  }
  return { group, overall: summarize(overallValues), perDimension };
};

/**
 * Aggregate a batch of scored sites.
 *
 * @param dimensionIds IDs from the codebook, used to guarantee every dimension
 *                     appears in the report even if zero sites scored on it.
 * @param axes         Stratum axis names to slice by. Missing axes are ignored.
 *                     Pass `['gewerkGroup']` or `['gewerkGroup', 'bundesland']`.
 */
export const aggregateCohort = (
  scored: readonly ScoredSite[],
  dimensionIds: readonly string[],
  axes: readonly string[] = [],
): CohortReport => {
  const cohort = aggregateSlice(scored, dimensionIds);

  const byAxis: Record<string, CohortAggregate[]> = {};

  for (const axis of axes) {
    const groups = new Map<string | number, ScoredSite[]>();
    for (const s of scored) {
      const key = s.stratum?.[axis];
      if (key === undefined) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(s);
      else groups.set(key, [s]);
    }

    const slices: CohortAggregate[] = [];
    for (const [key, subset] of Array.from(groups.entries()).sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])),
    )) {
      slices.push(aggregateSlice(subset, dimensionIds, { [axis]: key }));
    }
    byAxis[axis] = slices;
  }

  return { total: scored.length, cohort, byAxis };
};
