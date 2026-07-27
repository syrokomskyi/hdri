/*
<MODULE_CONTRACT>
<purpose>Shared types, constants, and directory layout for the HDRI dashboard archive exporter.</purpose>
<non-goals>
  <item>Does not read databases or write files.</item>
  <item>Does not compute aggregations or comparisons.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted shared types and constants from export-dashboard-archive.ts during file-size refactor.</item>
  <item>Replace SUPPRESSION_POLICY constant with createSuppressionPolicy(kAnonymityMin) factory; remove K_ANONYMITY_MIN import.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import {
  DELTA_SUPPRESSION_MIN_ABS,
  DELTA_SUPPRESSION_MIN_RELATIVE,
  type ScoreSummary,
  type ComparisonAxis,
} from "./comparison-core";

export const DASHBOARD_APP_DIR = path.resolve(process.cwd(), "../dashboard");
export const DASHBOARD_DATA_DIR = path.join(DASHBOARD_APP_DIR, "src", "assets", "data");
export const DASHBOARD_PUBLIC_DIR = path.join(DASHBOARD_DATA_DIR, "public");
export const DASHBOARD_STATIC_PUBLIC_DIR = path.join(DASHBOARD_APP_DIR, "public");
export const DASHBOARD_DEBUG_DIR = path.join(DASHBOARD_APP_DIR, ".debug");
export const DASHBOARD_DEBUG_PUBLIC_DIR = path.join(DASHBOARD_APP_DIR, ".debug-public");
export const OUTPUT_DIR = path.resolve(process.cwd(), ".output");
export const DB_DIR = path.join(OUTPUT_DIR, "db");

export type SuppressionPolicy = {
  kind: "k_plus_suppression_diffs";
  kAnonymityMin: number;
  minAbsoluteDelta: number;
  minRelativeDelta: number;
};

export function createSuppressionPolicy(kAnonymityMin: number): SuppressionPolicy {
  return {
    kind: "k_plus_suppression_diffs",
    kAnonymityMin,
    minAbsoluteDelta: DELTA_SUPPRESSION_MIN_ABS,
    minRelativeDelta: DELTA_SUPPRESSION_MIN_RELATIVE,
  };
}

export const MATURITY_BANDS = [
  { id: "kritisch", label: "Kritisch", min: 0, max: 20 },
  { id: "basis", label: "Basis", min: 20, max: 40 },
  { id: "aufbau", label: "Aufbau", min: 40, max: 60 },
  { id: "fortgeschritten", label: "Fortgeschritten", min: 60, max: 80 },
  { id: "vorbild", label: "Vorbild", min: 80, max: 101 },
] as const;

export const DIMENSION_LABELS: Record<string, string> = {
  legal_compliance: "Recht & Pflichtangaben",
  contact_accessibility: "Kontakt & Erreichbarkeit",
  structured_data: "Strukturierte Informationen",
  trust_signals: "Vertrauen & Nachweise",
  social_presence: "Soziale Präsenz",
  accessibility_audit: "Barrierefreiheit",
};

export type PublishedRunRow = {
  run_id: string;
  period: string;
  codebook_version: string;
  ontology_version: string;
  finished_at: string | null;
  published_at: string | null;
  factory_run_id: string | null;
  bundle_hash: string | null;
};

export type ScoreRow = {
  overall_score: number | null;
  confidence: number;
  bundesland: string | null;
  gewerk_group: string | null;
};

export type DimensionRow = {
  dimension_id: string;
  score: number | null;
  effective_weight: number;
};

export type Maturity = {
  id: string;
  label: string;
  count: number;
  share: number;
};

export type OverviewExport = {
  sampleSize: number;
  summary: ScoreSummary;
  maturity: Maturity[];
  confidence: ScoreSummary;
};

export type DimensionExport = ScoreSummary & {
  id: string;
  label: string;
  weight: number;
};

export type SliceExport = ScoreSummary & {
  id: string;
  label: string;
};

export type MatrixExport = {
  bundesland: string;
  gewerk: string;
  n: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export type PeriodManifest = {
  period: string;
  observatoryRunId: string;
  factoryRunId: string | null;
  bundleHash: string | null;
  codebookVersion: string;
  ontologyVersion: string;
  generatedAt: string;
  publishedAt: string;
  kAnonymityMin: number;
  suppressionPolicy: SuppressionPolicy;
  sampleSize: number;
  totalPublishedSlices: number;
  sourceDb: string;
};

export type ArchiveEntry = {
  period: string;
  manifestPath: string;
  overviewPath: string;
};

export type LatestPointer = {
  period: string;
  manifestPath: string;
};

export type ComparisonCategoryManifest = {
  key: string;
  label: string;
  firstPeriod: string;
  lastPeriod: string;
  periodsPresent: string[];
};

export type ComparisonManifest = {
  axis: ComparisonAxis;
  generatedAt: string;
  suppressionPolicy: SuppressionPolicy;
  periods: string[];
  categories: ComparisonCategoryManifest[];
};

export type PeriodSnapshot = {
  manifest: PeriodManifest;
  overview: OverviewExport;
  dimensions: DimensionExport[];
  bundeslaender: SliceExport[];
  gewerke: SliceExport[];
  /** Top-48 cells written to matrix.json for display. */
  matrix: MatrixExport[];
  /** All k-anon-passing cells, used for stable cross-period comparison. */
  matrixFull: MatrixExport[];
};

export type DebugSiteRow = {
  asset_id: string;
  domain: string | null;
  destatis_group: string | null;
  destatis_label: string | null;
  bundesland: string | null;
  overall_score: number | null;
  confidence: number;
  codebook_version: string;
};
