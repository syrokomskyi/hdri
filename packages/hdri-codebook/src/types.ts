/*
<MODULE_CONTRACT>
<purpose>Defines runtime input types and scoring output types for the HDRI scoring engine.
Input codebook types (Codebook, Indicator, ScoringRule, etc.) are derived from the Zod schema in parse.ts.</purpose>
<non-goals>
  <item>Does not define codebook input types — those are Zod-derived in parse.ts.</item>
  <item>Does not perform actual scoring computations.</item>
  <item>Does not handle signal extraction or data collection.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of type structures for scoring engine.</item>
  <item>Remove input type definitions (Codebook, ScoringRule, Indicator, etc.) — now Zod-derived in parse.ts.</item>
  <item>Keep runtime input types (SignalValue, SiteSignals, SiteSignalStatuses) and output types (SiteScore, DimensionScore, IndicatorTrace).</item>
</CHANGE_SUMMARY>
*/

/**
 * hdri-codebook — runtime and output type definitions.
 *
 * Input codebook types (Codebook, Indicator, ScoringRule, MissingPolicy, etc.)
 * are derived from the Zod schema in parse.ts — see that module for the
 * single source of truth.
 *
 * This module retains runtime input types (SignalValue, SiteSignals,
 * SiteSignalStatuses) that have no Zod representation, and scoring output
 * types (IndicatorTrace, DimensionScore, SiteScore).
 */

import type { ScoringRule } from "./parse.js";

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
export type SignalCollectionReason = "absent" | "unreachable" | "forbidden" | "not_applicable";

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
  rule: ScoringRule["type"];
  score: number | null; // null if skipped (missing + `skip` policy)
  weight: number;
  /** 1.0 = observed, 0.5 = imputed, 0.0 = skipped */
  confidence: number;
  note?: string;
};

export type DimensionScore = {
  dimensionId: string;
  score: number | null; // null if all indicators were skipped
  confidence: number; // mean confidence of contributing indicators
  effectiveWeight: number; // declared weight × fraction of indicators scored
};

export type SiteScore = {
  overallScore: number | null; // null if all dimensions were null
  confidence: number; // weighted mean confidence
  dimensions: readonly DimensionScore[];
  trace: readonly IndicatorTrace[];
  codebookVersion: string;
  codebookId: string;
};
