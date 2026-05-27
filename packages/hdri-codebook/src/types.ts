/**
 * hdri-codebook — type definitions.
 *
 * A codebook is a versioned, declarative scoring specification. It maps
 * arbitrary raw signals (extracted by upstream pipelines) onto a bounded
 * 0..100 score per dimension, plus a weighted overall score per site.
 *
 * The scoring engine has no knowledge of the domain (compliance, SEO,
 * performance…) — it only applies the rules declared in the codebook.
 * Adding a new signal from a future pipeline stage (e.g. T3 deep-audit)
 * requires **only** editing the codebook file — no code change.
 */

// ---------------------------------------------------------------------------
// Signals (input)
// ---------------------------------------------------------------------------

/**
 * Raw signals for a single site, keyed by arbitrary names that the codebook
 * references via `Indicator.inputKey`. Missing / null values are handled
 * according to each indicator's `missing` policy.
 */
export type SignalValue = number | boolean | string | null;
export type SiteSignals = Readonly<Record<string, SignalValue>>;

/**
 * Categorical reason a signal value is missing — keys of `ConditionalMissingPolicy.states`.
 * Distinct from `ConditionalMissingState` (which describes the scoring action).
 */
export type SignalCollectionReason =
  | 'absent'
  | 'unreachable'
  | 'forbidden'
  | 'not_applicable';

/**
 * Per-signal collection status, parallel to SiteSignals.
 *
 * Populated by upstream pipelines when a signal could not be collected for a
 * deterministic reason (site unreachable, blocked, signal not applicable to
 * site category, etc.). The scorer uses this map to resolve the
 * `conditional` missing policy precisely instead of falling back to `absent`.
 *
 * Absence of a signal_path in this map means "treat as absent" (default).
 */
export type SiteSignalStatuses = Readonly<Record<string, SignalCollectionReason>>;

/** Optional inputs to scoreSite() beyond the bare signal values. */
export type ScoreSiteOptions = {
  /** Per-signal collection status used by `conditional` missing policy. */
  readonly signalStatuses?: SiteSignalStatuses;
};

// ---------------------------------------------------------------------------
// Scoring rules (polymorphic)
// ---------------------------------------------------------------------------

/**
 * `bool` — signal must be a boolean. Maps true/false to the given scores.
 */
export type BoolRule = {
  type: 'bool';
  trueScore: number;          // e.g. 100
  falseScore: number;         // e.g. 0
};

/**
 * `presence` — signal is scored only by whether it is non-null / non-empty.
 * Useful for strings like opening_hours_text where any value counts.
 */
export type PresenceRule = {
  type: 'presence';
  presentScore: number;
  absentScore: number;
};

/**
 * `countClamp` — clamps a numeric signal to [min, max], then linearly maps
 *   min → scoreAtMin   (default 0)
 *   max → scoreAtMax   (default 100)
 * Values outside [min, max] are clamped, not extrapolated.
 */
export type CountClampRule = {
  type: 'countClamp';
  min: number;
  max: number;
  scoreAtMin?: number;
  scoreAtMax?: number;
};

/**
 * `countClampInverse` — clamps a numeric signal to [min, max], then linearly maps
 *   min → scoreAtMin   (default 100)
 *   max → scoreAtMax   (default 0)
 * Useful for defect counts where lower is better.
 */
export type CountClampInverseRule = {
  type: 'countClampInverse';
  min: number;
  max: number;
  scoreAtMin?: number;
  scoreAtMax?: number;
};

/**
 * `enum` — signal is compared to a fixed list of string cases.
 * If value is null/unknown, falls back to `defaultScore`.
 */
export type EnumRule = {
  type: 'enum';
  cases: Readonly<Record<string, number>>;
  defaultScore: number;
};

export type ScoringRule = BoolRule | PresenceRule | CountClampRule | CountClampInverseRule | EnumRule;

// ---------------------------------------------------------------------------
// Missing-value policy
// ---------------------------------------------------------------------------

/**
 * How to score an indicator when its input signal is absent (null / undefined):
 *   `zero`        → score 0, full confidence
 *   `skip`        → indicator excluded from the dimension roll-up (reduces weight)
 *   `impute`      → use `imputedScore` with reduced confidence (reported in trace)
 *   `conditional` → different action per collection status (absent/unreachable/forbidden/not_applicable)
 *
 * For `conditional`, the scoring engine currently falls back to the `absent` state
 * (or `default` when absent is not specified) because per-signal collection status
 * is not yet propagated through SiteSignals. Future pipeline versions will surface
 * HTTP/crawl status alongside each signal value.
 */
export type ConditionalMissingState = 'zero' | 'exclude' | 'skip';

export type ConditionalMissingPolicy = {
  kind: 'conditional';
  states: {
    /** Signal was reachable but the feature simply is not present on the site. */
    absent?: ConditionalMissingState;
    /** Crawler could not reach the site (timeout, DNS failure, 5xx). */
    unreachable?: ConditionalMissingState;
    /** Site blocked the crawler (403, anti-bot). */
    forbidden?: ConditionalMissingState;
    /** Signal is not applicable to this site category (e.g. e-commerce signal for a Dienstleister). */
    not_applicable?: ConditionalMissingState;
  };
  /** Fallback when collection status cannot be determined. */
  default: ConditionalMissingState;
};

export type MissingPolicy =
  | { kind: 'zero' }
  | { kind: 'skip' }
  | { kind: 'impute'; imputedScore: number }
  | ConditionalMissingPolicy;

// ---------------------------------------------------------------------------
// Indicator metadata
// ---------------------------------------------------------------------------

/** Signal provenance — which extractor produced the raw value. */
export type SignalSource = {
  extractor: string;
};

/**
 * Remediation guidance surfaced in reports and dashboards.
 * Allows score breakdowns to carry actionable recommendations
 * without requiring a separate lookup table.
 */
export type RemediationMetadata = {
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Broad category for grouping in reports (e.g. "legal", "ux", "trust"). */
  category: string;
  /** Short human-readable label shown in the indicator row. */
  humanLabel: string;
  /** Concrete recommendation shown when this indicator scores < 60. */
  recommendation: string;
};

// ---------------------------------------------------------------------------
// Indicator & Dimension
// ---------------------------------------------------------------------------

export type Indicator = {
  id: string;
  inputKey: string;
  weight: number;
  rule: ScoringRule;
  missing: MissingPolicy;
  description?: string;
  /** Where the raw signal value comes from. */
  source?: SignalSource;
  /** Actionable guidance for low-scoring indicators. */
  remediation?: RemediationMetadata;
};

export type Dimension = {
  id: string;
  label?: string;
  weight: number;
  indicators: readonly Indicator[];
};

// ---------------------------------------------------------------------------
// Codebook (top-level)
// ---------------------------------------------------------------------------

export type Codebook = {
  /** Stable identifier, e.g. "hdri-handwerk-v1". */
  id: string;
  /** Semver version — MAJOR changes mean incompatible scoring. */
  version: string;
  /** Human-readable label shown in reports. */
  label?: string;
  /** Path to the companion ontology file (informational — not loaded by the scorer). */
  ontologyRef?: string;
  /** Comment stored with scoring runs for reproducibility. */
  notes?: string;
  dimensions: readonly Dimension[];
};

// ---------------------------------------------------------------------------
// Scoring results (output)
// ---------------------------------------------------------------------------

/**
 * Per-indicator trace row — what rule applied, what score came out, and why.
 * Included in every site's scoring result so that audits can reproduce the
 * reasoning for each contribution.
 */
export type IndicatorTrace = {
  dimensionId: string;
  indicatorId: string;
  inputKey: string;
  rawValue: SignalValue | undefined;
  rule: ScoringRule['type'];
  score: number | null;          // null if skipped (missing + `skip` policy)
  weight: number;
  /** 1.0 = observed, 0.5 = imputed, 0.0 = skipped */
  confidence: number;
  note?: string;
};

export type DimensionScore = {
  dimensionId: string;
  score: number | null;           // null if all indicators were skipped
  confidence: number;              // mean confidence of contributing indicators
  effectiveWeight: number;         // declared weight × fraction of indicators scored
};

export type SiteScore = {
  overallScore: number | null;    // null if all dimensions were null
  confidence: number;              // weighted mean confidence
  dimensions: readonly DimensionScore[];
  trace: readonly IndicatorTrace[];
  codebookVersion: string;
  codebookId: string;
};
