/*
<MODULE_CONTRACT>
<purpose>Deterministic, reproducible statistics helpers for HDRI trend significance — this module handles stats-core operations within the pipeline application.</purpose>
<non-goals>
  <item>No I/O. No domain knowledge — pure numeric functions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP4: deterministic bootstrap CI so cross-quarter deltas can be reported with significance.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

/** Deterministic PRNG (mulberry32) — fixed seed ⇒ reproducible published CIs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function quantile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower] ?? 0;
  const lo = sortedValues[lower] ?? 0;
  const hi = sortedValues[upper] ?? lo;
  return lo + (hi - lo) * (index - lower);
}

export function median(values: number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

export type MeanCI = {
  /** Sample mean of the input. */
  mean: number;
  /** Lower / upper percentile bootstrap bounds at the chosen confidence level. */
  lo: number;
  hi: number;
  n: number;
  iterations: number;
  /** Confidence level, e.g. 0.95. */
  level: number;
  /** True when the CI excludes 0 — the change is statistically distinguishable from none. */
  significant: boolean;
};

export type BootstrapOptions = {
  iterations?: number;
  /** Confidence level (default 0.95). */
  level?: number;
  /** PRNG seed — fixed by default so output is reproducible. */
  seed?: number;
};

/**
 * Percentile bootstrap CI for the mean of `values`. With paired score changes
 * (cur − prev per asset) this gives a significance-aware delta: `significant`
 * is true when the interval excludes zero. Deterministic for a given seed.
 */
export function bootstrapMeanCI(values: number[], opts: BootstrapOptions = {}): MeanCI {
  const iterations = opts.iterations ?? 2000;
  const level = opts.level ?? 0.95;
  const seed = opts.seed ?? 42;
  const n = values.length;
  const sampleMean = mean(values);

  if (n === 0) {
    return { mean: 0, lo: 0, hi: 0, n: 0, iterations, level, significant: false };
  }
  if (n === 1) {
    // No spread to resample — report the point with a degenerate interval.
    return {
      mean: sampleMean,
      lo: sampleMean,
      hi: sampleMean,
      n,
      iterations,
      level,
      significant: false,
    };
  }

  const rand = mulberry32(seed);
  const means = new Array<number>(iterations);
  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += values[Math.floor(rand() * n)]!;
    }
    means[b] = sum / n;
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lo = quantile(means, alpha);
  const hi = quantile(means, 1 - alpha);
  return {
    mean: sampleMean,
    lo,
    hi,
    n,
    iterations,
    level,
    significant: lo > 0 || hi < 0,
  };
}
