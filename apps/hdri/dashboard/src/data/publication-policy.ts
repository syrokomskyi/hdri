/**
 * <MODULE_CONTRACT><purpose>Resolve publication-policy display metadata and explain quarterly comparison limits.</purpose><non-goals><item>Never mutate archived manifests, change release admission, or authorize trend products.</item></non-goals></MODULE_CONTRACT>
 * <CHANGE_SUMMARY><item>Correct the original Q2 threshold using its preserved May manifest; keep Q3 policy distinct.</item></CHANGE_SUMMARY>
 */
import type { PeriodManifest } from "../types";

export const Q2_THRESHOLD_CORRECTION = {
  id: "2026-09-29-q2-publication-threshold",
  period: "2026-q2",
  observatoryRunId: "14373674-bbbe-4fed-bb4c-dfd89bc06281",
  originalK: 5,
  regeneratedK: 12,
  evidenceCommit: "04488a05d",
  evidencePath: "apps/source/apps/hdri-dashboard/src/assets/data/public/periods/2026-q2/manifest.json",
} as const;

export function publicationThreshold(manifest: PeriodManifest): number {
  const correction = Q2_THRESHOLD_CORRECTION;
  if (manifest.period !== correction.period || manifest.observatoryRunId !== correction.observatoryRunId) {
    return manifest.kAnonymityMin;
  }
  if (manifest.kAnonymityMin !== correction.originalK && manifest.kAnonymityMin !== correction.regeneratedK) {
    throw new Error("Q2 publication threshold no longer matches its documented metadata correction");
  }
  return correction.originalK;
}

export const publicationThresholdHistory =
  "Die ursprüngliche Publikationsschwelle beträgt für 2026-q2 n ≥ 5 und für 2026-q3 n ≥ 12. Die strengere Q3-Schwelle gilt nicht rückwirkend für Q2.";

export const quarterComparisonExplanation =
  "Q2 und Q3 sind deskriptive Quartalsschnitte, keine freigegebene Trendreihe. Der Erhebungsrahmen wächst um neue Websites; ausgewertet werden jeweils aktuell erreichbare und auswertbare Websites. Eine Differenz kann deshalb sowohl Veränderungen der Websites als auch eine veränderte Zusammensetzung widerspiegeln. Dasselbe Codebook allein belegt noch keine vollständige Vergleichbarkeit von Erhebung, Auswahl und Veröffentlichung. Für Q2 → Q3 werden daher keine Veränderungsraten oder Aussagen über einen Anstieg oder Rückgang der digitalen Reife des gesamten Marktes veröffentlicht.";
