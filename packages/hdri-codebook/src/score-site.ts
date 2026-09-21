/*
<MODULE_CONTRACT>
<purpose>Evaluates and scores site signals against a codebook of indicators and dimensions.
Includes rule appliers for bool, presence, countClamp, countClampInverse, and enum rules.</purpose>
<non-goals>
  <item>Does not perform any I/O operations or interact with external systems.</item>
  <item>Does not handle real-time data updates or asynchronous processing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of site scoring based on codebook rules.</item>
  <item>Merge scoring-rules.ts into this module — rule appliers are now internal functions.</item>
  <item>Import codebook input types from parse.ts (Zod-derived) instead of types.ts.</item>
</CHANGE_SUMMARY>
*/

import type {
  BoolRule,
  Codebook,
  CountClampInverseRule,
  CountClampRule,
  EnumRule,
  Indicator,
  PresenceRule,
  ScoringRule,
} from "./parse.js";
import type {
  DimensionScore,
  IndicatorTrace,
  ScoreSiteOptions,
  SiteScore,
  SiteSignalStatuses,
  SiteSignals,
  SignalValue,
} from "./types.js";

// ---------------------------------------------------------------------------
// Rule appliers (merged from scoring-rules.ts)
// ---------------------------------------------------------------------------

const applyBool = (value: SignalValue, rule: BoolRule): number => {
  if (typeof value !== "boolean") {
    // Permissive coercion: 0/1, "true"/"false"
    if (value === 1 || value === "1" || value === "true") return rule.trueScore;
    if (value === 0 || value === "0" || value === "false") return rule.falseScore;
    throw new Error(
      `Rule "bool" requires boolean input; got ${typeof value}: ${JSON.stringify(value)}`,
    );
  }
  return value ? rule.trueScore : rule.falseScore;
};

const applyPresence = (value: SignalValue, rule: PresenceRule): number => {
  const present =
    value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
  return present ? rule.presentScore : rule.absentScore;
};

const applyCountClamp = (value: SignalValue, rule: CountClampRule): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Rule "countClamp" requires finite number input; got ${typeof value}: ${JSON.stringify(value)}`,
    );
  }
  const min = rule.min;
  const max = rule.max;
  if (max <= min) throw new Error(`countClamp: max (${max}) must be > min (${min})`);
  const scoreAtMin = rule.scoreAtMin ?? 0;
  const scoreAtMax = rule.scoreAtMax ?? 100;

  const clamped = Math.max(min, Math.min(max, value));
  const t = (clamped - min) / (max - min);
  return scoreAtMin + (scoreAtMax - scoreAtMin) * t;
};

const applyCountClampInverse = (value: SignalValue, rule: CountClampInverseRule): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Rule "countClampInverse" requires finite number input; got ${typeof value}: ${JSON.stringify(value)}`,
    );
  }
  const min = rule.min;
  const max = rule.max;
  if (max <= min) throw new Error(`countClampInverse: max (${max}) must be > min (${min})`);
  const scoreAtMin = rule.scoreAtMin ?? 100;
  const scoreAtMax = rule.scoreAtMax ?? 0;

  const clamped = Math.max(min, Math.min(max, value));
  const t = (clamped - min) / (max - min);
  return scoreAtMin + (scoreAtMax - scoreAtMin) * t;
};

const applyEnum = (value: SignalValue, rule: EnumRule): number => {
  if (value === null || value === undefined) return rule.defaultScore;
  const key = String(value);
  if (Object.hasOwn(rule.cases, key)) return rule.cases[key] as number;
  return rule.defaultScore;
};

/** Applies a scoring rule to a raw signal value and returns a score. */
export const applyRule = (value: SignalValue, rule: ScoringRule): number => {
  switch (rule.type) {
    case "bool":
      return applyBool(value, rule);
    case "presence":
      return applyPresence(value, rule);
    case "countClamp":
      return applyCountClamp(value, rule);
    case "countClampInverse":
      return applyCountClampInverse(value, rule);
    case "enum":
      return applyEnum(value, rule);
  }
};

/** True when the input is considered "missing" for scoring purposes. */
export const isMissing = (value: SignalValue | undefined, rule: ScoringRule): boolean => {
  if (rule.type === "presence") return false;
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
};

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
  const baseTrace: Omit<IndicatorTrace, "score" | "confidence" | "note"> = {
    dimensionId,
    indicatorId: ind.id,
    inputKey: ind.inputKey,
    rawValue: raw,
    rule: ind.rule.type,
    weight: ind.weight,
  };

  if (isMissing(raw, ind.rule)) {
    const policy = ind.missing;
    if (policy.kind === "zero") {
      return {
        trace: { ...baseTrace, score: 0, confidence: 1, note: "missing → zero" },
        weightedScore: 0,
        countedWeight: ind.weight,
      };
    }
    if (policy.kind === "skip") {
      return {
        trace: { ...baseTrace, score: null, confidence: 0, note: "missing → skipped" },
        weightedScore: null,
        countedWeight: 0,
      };
    }
    if (policy.kind === "conditional") {
      // Resolve per-signal collection status. When upstream provides one in
      // signalStatuses (e.g. 'unreachable' from the liveness pipeline), use it
      // to look up the matching state in policy.states; otherwise fall back to
      // 'absent' state, then to policy.default.
      const explicitStatus = signalStatuses?.[ind.inputKey];
      const stateKey = explicitStatus
        ? (policy.states[explicitStatus] ?? policy.default)
        : (policy.states.absent ?? policy.default);
      const stateLabel = explicitStatus ?? "absent";
      if (stateKey === "zero") {
        return {
          trace: {
            ...baseTrace,
            score: 0,
            confidence: 1,
            note: `missing → conditional.${stateLabel} → zero`,
          },
          weightedScore: 0,
          countedWeight: ind.weight,
        };
      }
      // 'exclude' and 'skip' both result in exclusion from the dimension roll-up
      return {
        trace: {
          ...baseTrace,
          score: null,
          confidence: 0,
          note: `missing → conditional.${stateLabel} → ${stateKey}`,
        },
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
  weightedDimScore: number | null; // dim score × dim weight (for overall sum)
  countedDimWeight: number; // effective weight used in overall sum
};

const evalDimension = (
  dim: Codebook["dimensions"][number],
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
    effectiveWeight =
      totalDeclaredWeight > 0 ? dim.weight * (totalCountedWeight / totalDeclaredWeight) : 0;
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
