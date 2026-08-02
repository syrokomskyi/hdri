/*
<MODULE_CONTRACT>
<purpose>Defines data structures for statistical summaries and comparisons</purpose>
<non-goals>
  <item>Does not implement data processing algorithms</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of data types for statistical analysis</item>
</CHANGE_SUMMARY>
*/

export type Summary = {
  n: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
  stdDev?: number;
};

export type Maturity = {
  id: string;
  label: string;
  count: number;
  share: number;
};

export type DimensionItem = Summary & {
  id: string;
  label: string;
  weight: number;
};

export type SliceItem = Summary & {
  id: string;
  label: string;
};

export type MatrixItem = {
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
  codebookVersion: string;
  generatedAt: string;
  publishedAt: string;
  kAnonymityMin: number;
  sampleSize: number;
  totalPublishedSlices: number;
  suppressionPolicy: {
    kind: string;
  };
};

export type Overview = {
  sampleSize: number;
  summary: Summary;
  maturity: Maturity[];
  confidence: Summary;
};

export type ComparisonPoint = {
  axis: "overall" | "dimension" | "bundesland" | "gewerk" | "matrix";
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
  currentStatus: "present" | "suppressed" | "absent";
  previousStatus: "present" | "suppressed" | "absent";
  deltaFromPrevious: number | null;
  suppressionReasons: string[];
  reliability: "reliable" | "caution" | "suppressed";
};
