/*
<MODULE_CONTRACT>
<purpose>Matched-panel (like-for-like) cross-quarter trend: the composition-robust delta — this module handles panel-core operations within the pipeline application.</purpose>
<non-goals>
  <item>No I/O — the exporter supplies period→(assetId→score) maps.</item>
  <item>Not a replacement for the descriptive cross-sectional index; an additive, comparable view.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP4: like-for-like panel trend so Q2→Q3 stays comparable despite a tripled sample.</item>
  <item>Remove hardcoded K_ANONYMITY_MIN=5; buildPanelTrends now requires kAnonymityMin parameter.</item>
  <item>Make kAnonymityMin required on computePanelPoint; remove magic-number 5 fallback.</item>
</CHANGE_SUMMARY>
*/

import { bootstrapMeanCI, mean, median } from "./stats-core";

const round = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export type PanelPoint = {
  period: string;
  previousPeriod: string;
  /** Assets scored in BOTH periods (the matched panel). */
  nPanel: number;
  /** Assets scored in the current period (coverage denominator). */
  nCurrent: number;
  /** nPanel / nCurrent — how much of the current sample the panel represents. */
  coverage: number;
  /** Mean of per-asset score change (current − previous) over the matched panel. */
  meanChange: number | null;
  medianChange: number | null;
  ci: { lo: number; hi: number; level: number } | null;
  /** True when the bootstrap CI excludes 0 — a real movement for the same businesses. */
  significant: boolean;
  reliability: "reliable" | "caution" | "suppressed";
  suppressed: boolean;
};

export type PeriodScores = { period: string; scores: Map<string, number> };

export function computePanelPoint(input: {
  period: string;
  previousPeriod: string;
  current: Map<string, number>;
  previous: Map<string, number>;
  kAnonymityMin: number;
}): PanelPoint {
  const k = input.kAnonymityMin;
  const changes: number[] = [];
  // Iterate the smaller map for efficiency.
  const [small, large] =
    input.current.size <= input.previous.size
      ? [input.current, input.previous]
      : [input.previous, input.current];
  const sign = small === input.current ? 1 : -1;
  for (const [assetId, a] of small) {
    const b = large.get(assetId);
    if (b != null) changes.push(sign * (a - b));
  }

  const nPanel = changes.length;
  const nCurrent = input.current.size;
  const coverage = nCurrent > 0 ? round2(nPanel / nCurrent) : 0;

  if (nPanel < k) {
    return {
      period: input.period,
      previousPeriod: input.previousPeriod,
      nPanel,
      nCurrent,
      coverage,
      meanChange: null,
      medianChange: null,
      ci: null,
      significant: false,
      reliability: "suppressed",
      suppressed: true,
    };
  }

  const ci = bootstrapMeanCI(changes, { level: 0.95 });
  const reliability = nPanel < 30 ? "caution" : ci.significant ? "reliable" : "caution";
  return {
    period: input.period,
    previousPeriod: input.previousPeriod,
    nPanel,
    nCurrent,
    coverage,
    meanChange: round(mean(changes)),
    medianChange: round(median(changes)),
    ci: { lo: round(ci.lo), hi: round(ci.hi), level: ci.level },
    significant: ci.significant,
    reliability,
    suppressed: false,
  };
}

/** Panel deltas for every adjacent published period pair. `periodScores` must be sorted ascending. */
export function buildPanelTrends(
  periodScores: PeriodScores[],
  kAnonymityMin: number,
): PanelPoint[] {
  const out: PanelPoint[] = [];
  for (let i = 1; i < periodScores.length; i++) {
    const prev = periodScores[i - 1]!;
    const cur = periodScores[i]!;
    out.push(
      computePanelPoint({
        period: cur.period,
        previousPeriod: prev.period,
        current: cur.scores,
        previous: prev.scores,
        kAnonymityMin,
      }),
    );
  }
  return out;
}
