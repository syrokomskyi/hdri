import type { BoolRule, CountClampRule, EnumRule, PresenceRule, ScoringRule, SignalValue } from './types.js';

// ---------------------------------------------------------------------------
// Individual rule appliers
// ---------------------------------------------------------------------------

const applyBool = (value: SignalValue, rule: BoolRule): number => {
  if (typeof value !== 'boolean') {
    // Permissive coercion: 0/1, "true"/"false"
    if (value === 1 || value === '1' || value === 'true') return rule.trueScore;
    if (value === 0 || value === '0' || value === 'false') return rule.falseScore;
    throw new Error(
      `Rule "bool" requires boolean input; got ${typeof value}: ${JSON.stringify(value)}`,
    );
  }
  return value ? rule.trueScore : rule.falseScore;
};

const applyPresence = (value: SignalValue, rule: PresenceRule): number => {
  const present =
    value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '');
  return present ? rule.presentScore : rule.absentScore;
};

const applyCountClamp = (value: SignalValue, rule: CountClampRule): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
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

const applyCountClampInverse = (value: SignalValue, rule: Extract<ScoringRule, { type: 'countClampInverse' }>): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Applies a scoring rule to a raw signal value and returns a score.
 * Callers must handle the null/undefined (missing) case *before* calling —
 * a missing value never reaches the rule body.
 */
export const applyRule = (value: SignalValue, rule: ScoringRule): number => {
  switch (rule.type) {
    case 'bool':        return applyBool(value, rule);
    case 'presence':    return applyPresence(value, rule);
    case 'countClamp':  return applyCountClamp(value, rule);
    case 'countClampInverse': return applyCountClampInverse(value, rule);
    case 'enum':        return applyEnum(value, rule);
  }
};

/**
 * True when the input is considered "missing" for scoring purposes.
 * `presence` rule is an exception — it actively inspects missingness itself
 * and should never see values filtered out as missing before it runs.
 */
export const isMissing = (value: SignalValue | undefined, rule: ScoringRule): boolean => {
  if (rule.type === 'presence') return false;   // presence handles missingness
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
};
