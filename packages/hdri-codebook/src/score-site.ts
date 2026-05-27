import { applyRule, isMissing } from './scoring-rules.js';
import type {
  Codebook, DimensionScore, Indicator, IndicatorTrace,
  ScoreSiteOptions, SiteScore, SiteSignals, SiteSignalStatuses,
} from './types.js';

// ---------------------------------------------------------------------------
// Per-indicator
// ---------------------------------------------------------------------------

type IndicatorEval = {
  trace: IndicatorTrace;
  /** Contribution to the dimension weighted sum, or null if skipped. */
  weightedScore: number | null;
  /** Weight that actually counted (0 if skipped). */
  countedWeight: number;
};

const evalIndicator = (
  dimensionId: string,
  ind: Indicator,
  signals: SiteSignals,
  signalStatuses?: SiteSignalStatuses,
): IndicatorEval => {
  const raw = signals[ind.inputKey];
  const baseTrace: Omit<IndicatorTrace, 'score' | 'confidence' | 'note'> = {
    dimensionId,
    indicatorId: ind.id,
    inputKey: ind.inputKey,
    rawValue: raw,
    rule: ind.rule.type,
    weight: ind.weight,
  };

  if (isMissing(raw, ind.rule)) {
    const policy = ind.missing;
    if (policy.kind === 'zero') {
      return {
        trace: { ...baseTrace, score: 0, confidence: 1, note: 'missing → zero' },
        weightedScore: 0,
        countedWeight: ind.weight,
      };
    }
    if (policy.kind === 'skip') {
      return {
        trace: { ...baseTrace, score: null, confidence: 0, note: 'missing → skipped' },
        weightedScore: null,
        countedWeight: 0,
      };
    }
    if (policy.kind === 'conditional') {
      // Resolve per-signal collection status. When upstream provides one in
      // signalStatuses (e.g. 'unreachable' from the liveness pipeline), use it
      // to look up the matching state in policy.states; otherwise fall back to
      // 'absent' state, then to policy.default.
      const explicitStatus = signalStatuses?.[ind.inputKey];
      const stateKey = explicitStatus
        ? (policy.states[explicitStatus] ?? policy.default)
        : (policy.states.absent ?? policy.default);
      const stateLabel = explicitStatus ?? 'absent';
      if (stateKey === 'zero') {
        return {
          trace: { ...baseTrace, score: 0, confidence: 1, note: `missing → conditional.${stateLabel} → zero` },
          weightedScore: 0,
          countedWeight: ind.weight,
        };
      }
      // 'exclude' and 'skip' both result in exclusion from the dimension roll-up
      return {
        trace: { ...baseTrace, score: null, confidence: 0, note: `missing → conditional.${stateLabel} → ${stateKey}` },
        weightedScore: null,
        countedWeight: 0,
      };
    }
    // impute
    return {
      trace: {
        ...baseTrace,
        score: policy.imputedScore,
        confidence: 0.5,
        note: `missing → imputed ${policy.imputedScore}`,
      },
      weightedScore: policy.imputedScore * ind.weight,
      countedWeight: ind.weight,
    };
  }

  // Present value → apply rule. Catch rule errors so a single malformed
  // signal can't crash the entire batch.
  try {
    const score = applyRule(raw as never, ind.rule);
    return {
      trace: { ...baseTrace, score, confidence: 1 },
      weightedScore: score * ind.weight,
      countedWeight: ind.weight,
    };
  } catch (err) {
    return {
      trace: {
        ...baseTrace,
        score: null,
        confidence: 0,
        note: `rule error: ${err instanceof Error ? err.message : String(err)}`,
      },
      weightedScore: null,
      countedWeight: 0,
    };
  }
};

// ---------------------------------------------------------------------------
// Per-dimension roll-up
// ---------------------------------------------------------------------------

type DimensionEval = {
  dimensionScore: DimensionScore;
  traces: IndicatorTrace[];
  weightedDimScore: number | null;      // dim score × dim weight (for overall sum)
  countedDimWeight: number;             // effective weight used in overall sum
};

const evalDimension = (
  dim: Codebook['dimensions'][number],
  signals: SiteSignals,
  signalStatuses?: SiteSignalStatuses,
): DimensionEval => {
  const evals = dim.indicators.map((ind) => evalIndicator(dim.id, ind, signals, signalStatuses));
  const traces = evals.map((e) => e.trace);

  const totalDeclaredWeight = dim.indicators.reduce((s, i) => s + i.weight, 0);
  const totalCountedWeight = evals.reduce((s, e) => s + e.countedWeight, 0);

  let dimScore: number | null = null;
  let confidence = 0;
  let effectiveWeight = 0;

  if (totalCountedWeight > 0) {
    const weightedSum = evals.reduce((s, e) => s + (e.weightedScore ?? 0), 0);
    dimScore = weightedSum / totalCountedWeight;

    const confWeightedSum = evals
      .filter((e) => e.countedWeight > 0)
      .reduce((s, e) => s + e.trace.confidence * e.countedWeight, 0);
    confidence = confWeightedSum / totalCountedWeight;

    // Effective weight = declared × coverage fraction (skip-aware)
    effectiveWeight = totalDeclaredWeight > 0
      ? dim.weight * (totalCountedWeight / totalDeclaredWeight)
      : 0;
  }

  return {
    dimensionScore: {
      dimensionId: dim.id,
      score: dimScore === null ? null : round2(dimScore),
      confidence: round3(confidence),
      effectiveWeight: round3(effectiveWeight),
    },
    traces,
    weightedDimScore: dimScore === null ? null : dimScore * effectiveWeight,
    countedDimWeight: effectiveWeight,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scores a single site's signals against a codebook.
 *
 * Pure function:
 *   - no I/O, no clocks, no randomness;
 *   - same inputs always produce identical output (deterministic);
 *   - safe for concurrent calls on the same codebook instance.
 */
export const scoreSite = (
  signals: SiteSignals,
  codebook: Codebook,
  options?: ScoreSiteOptions,
): SiteScore => {
  const dimEvals = codebook.dimensions.map((d) =>
    evalDimension(d, signals, options?.signalStatuses),
  );

  const totalEffWeight = dimEvals.reduce((s, d) => s + d.countedDimWeight, 0);

  let overall: number | null = null;
  let overallConfidence = 0;

  if (totalEffWeight > 0) {
    const weightedSum = dimEvals.reduce((s, d) => s + (d.weightedDimScore ?? 0), 0);
    overall = weightedSum / totalEffWeight;

    const confSum = dimEvals
      .filter((d) => d.countedDimWeight > 0)
      .reduce((s, d) => s + d.dimensionScore.confidence * d.countedDimWeight, 0);
    overallConfidence = confSum / totalEffWeight;
  }

  return {
    overallScore: overall === null ? null : round2(overall),
    confidence: round3(overallConfidence),
    dimensions: dimEvals.map((d) => d.dimensionScore),
    trace: dimEvals.flatMap((d) => d.traces),
    codebookVersion: codebook.version,
    codebookId: codebook.id,
  };
};

// ---------------------------------------------------------------------------
// Rounding (deterministic)
// ---------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
