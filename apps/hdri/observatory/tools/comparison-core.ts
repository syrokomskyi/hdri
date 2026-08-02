/*
<MODULE_CONTRACT>
<purpose>Pure cross-period comparison logic for the HDRI dashboard export — the scientific guard rails.</purpose>
<non-goals>
  <item>No I/O, no DB, no file writes — pure functions so they are unit-testable in isolation.</item>
  <item>Does not build snapshots or aggregates — the exporter orchestrates that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP3: extracted from export-dashboard-archive.ts so the comparison guards are unit-testable.</item>
  <item>Replace hardcoded K_ANONYMITY_MIN=5 with required kAnonymityMin parameter on getSuppressionReasons and createComparisonPoint.</item>
</CHANGE_SUMMARY>
*/

export const DELTA_SUPPRESSION_MIN_ABS = 3;
export const DELTA_SUPPRESSION_MIN_RELATIVE = 0.03;
// Relative change in N above which a cross-sectional delta is treated as
// confounded by sample-frame composition (e.g. a tripled Q3 sample) and never
// marked "reliable". The descriptive value still shows; only trust is downgraded.
export const SAMPLE_FRAME_SHIFT_WARN = 0.5;

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
  stdDev: number;
};

export type ComparisonAxis = "overall" | "dimension" | "bundesland" | "gewerk" | "matrix";
export type ComparisonPresence = "present" | "suppressed" | "absent";

export type SuppressionReason =
  | "no_previous_period"
  | "current_sample_below_k"
  | "previous_sample_below_k"
  | "delta_below_absolute_threshold"
  | "delta_below_relative_threshold"
  | "category_absent_current"
  | "category_absent_previous"
  | "codebook_version_changed"
  | "ontology_version_changed";

/** Non-suppressing scientific caveats on a comparison (delta still shown). */
export type ComparabilityWarning = "sample_frame_changed";

export type Reliability = "reliable" | "caution" | "suppressed";

export type ComparisonPoint = {
  axis: ComparisonAxis;
  period: string;
  previousPeriod: string | null;
  label: string;
  key: string;
  n: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  currentStatus: ComparisonPresence;
  previousStatus: ComparisonPresence;
  deltaFromPrevious: number | null;
  suppressionReasons: SuppressionReason[];
  /** Caveats that do NOT suppress the delta but lower its trust (e.g. N tripled). */
  comparabilityWarnings: ComparabilityWarning[];
  reliability: Reliability;
};

/** Versions that determine whether two periods' scores are comparable at all. */
export type ComparableVersions = { codebookVersion: string; ontologyVersion: string };

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function emptySummary(): ScoreSummary {
  return { n: 0, mean: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, min: 0, max: 0, stdDev: 0 };
}

/** Codebook/ontology version changes that make a cross-quarter delta invalid. */
export function versionMismatchReasons(
  prev: ComparableVersions | null,
  cur: ComparableVersions,
): SuppressionReason[] {
  if (!prev) return [];
  const reasons: SuppressionReason[] = [];
  if (prev.codebookVersion !== cur.codebookVersion) reasons.push("codebook_version_changed");
  if (prev.ontologyVersion !== cur.ontologyVersion) reasons.push("ontology_version_changed");
  return reasons;
}

/** Non-suppressing caveats: a large change in N confounds a cross-sectional delta. */
export function computeComparabilityWarnings(
  current: ScoreSummary | null,
  previous: ScoreSummary | null,
): ComparabilityWarning[] {
  const warnings: ComparabilityWarning[] = [];
  if (current && previous) {
    const frameShift = Math.abs(current.n - previous.n) / Math.max(previous.n, 1);
    if (frameShift > SAMPLE_FRAME_SHIFT_WARN) warnings.push("sample_frame_changed");
  }
  return warnings;
}

export function computeReliability(
  current: ScoreSummary | null,
  previous: ScoreSummary | null,
  delta: number | null,
  suppressionReasons: SuppressionReason[],
  comparabilityWarnings: ComparabilityWarning[],
): Reliability {
  if (suppressionReasons.length > 0) return "suppressed";
  if (!current || !previous) return "suppressed";
  // A confounded comparison (e.g. tripled sample frame) is never "reliable".
  if (comparabilityWarnings.length > 0) return "caution";
  if (current.n < 30 || previous.n < 30) return "caution";
  if (delta == null) return "caution";
  if (Math.abs(delta) < 3) return "caution";
  return "reliable";
}

export function getSuppressionReasons(input: {
  current: ScoreSummary | null;
  previous: ScoreSummary | null;
  delta: number | null;
  currentPresent: boolean;
  previousPresent: boolean;
  versionMismatch: SuppressionReason[];
  kAnonymityMin: number;
}): SuppressionReason[] {
  const reasons: SuppressionReason[] = [];
  if (!input.currentPresent) {
    reasons.push("category_absent_current");
    return reasons;
  }
  if (!input.previousPresent) {
    reasons.push("no_previous_period");
    return reasons;
  }
  if (!input.previous) {
    reasons.push("category_absent_previous");
    return reasons;
  }
  if (!input.current) {
    reasons.push("category_absent_current");
    return reasons;
  }
  // Both periods present: if scores came from different codebook/ontology
  // versions, the delta is invalid regardless of sample sizes — hard suppress.
  if (input.versionMismatch.length > 0) {
    return [...new Set(input.versionMismatch)];
  }
  if (input.current.n < input.kAnonymityMin) {
    reasons.push("current_sample_below_k");
  }
  if (input.previous.n < input.kAnonymityMin) {
    reasons.push("previous_sample_below_k");
  }
  if (input.delta == null) {
    return reasons;
  }
  const absDelta = Math.abs(input.delta);
  if (absDelta < DELTA_SUPPRESSION_MIN_ABS) {
    reasons.push("delta_below_absolute_threshold");
  }
  const baseline = Math.max(Math.abs(input.previous.p75), 1);
  if (absDelta / baseline < DELTA_SUPPRESSION_MIN_RELATIVE) {
    reasons.push("delta_below_relative_threshold");
  }
  return [...new Set(reasons)];
}

export function createComparisonPoint(input: {
  axis: ComparisonAxis;
  period: string;
  previousPeriod: string | null;
  label: string;
  key: string;
  current: ScoreSummary | null;
  previous: ScoreSummary | null;
  currentPresent: boolean;
  previousPresent: boolean;
  /** Hard-suppressing version mismatch vs the previous period (empty if comparable). */
  versionMismatch: SuppressionReason[];
  kAnonymityMin: number;
}): ComparisonPoint {
  const currentSummary = input.current ?? emptySummary();
  const delta =
    input.current && input.previous ? round(input.current.p75 - input.previous.p75) : null;
  const suppressionReasons = getSuppressionReasons({
    current: input.current,
    previous: input.previous,
    delta,
    currentPresent: input.currentPresent,
    previousPresent: input.previousPresent,
    versionMismatch: input.versionMismatch,
    kAnonymityMin: input.kAnonymityMin,
  });
  const comparabilityWarnings = computeComparabilityWarnings(input.current, input.previous);
  const reliability = computeReliability(
    input.current,
    input.previous,
    delta,
    suppressionReasons,
    comparabilityWarnings,
  );
  return {
    axis: input.axis,
    period: input.period,
    previousPeriod: input.previousPeriod,
    label: input.label,
    key: input.key,
    n: currentSummary.n,
    mean: currentSummary.mean,
    p10: currentSummary.p10,
    p25: currentSummary.p25,
    p50: currentSummary.p50,
    p75: currentSummary.p75,
    p90: currentSummary.p90,
    currentStatus: !input.currentPresent
      ? "absent"
      : suppressionReasons.length > 0
        ? "suppressed"
        : "present",
    previousStatus: !input.previousPresent ? "absent" : input.previous ? "present" : "suppressed",
    deltaFromPrevious: suppressionReasons.length > 0 ? null : delta,
    suppressionReasons,
    comparabilityWarnings,
    reliability,
  };
}
