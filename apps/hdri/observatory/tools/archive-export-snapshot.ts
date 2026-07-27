/*
<MODULE_CONTRACT>
<purpose>Per-period snapshot aggregation for the HDRI dashboard archive exporter — this module handles archive-export-snapshot operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not read databases directly (consumes rows prepared by archive-export-db.ts).</item>
  <item>Does not write files or build cross-period comparisons.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted snapshot and aggregation helpers from export-dashboard-archive.ts during file-size refactor.</item>
  <item>Replace hardcoded K_ANONYMITY_MIN with required kAnonymityMin parameter on buildSnapshot and aggregation functions.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: snapshot integrity is verified by SHA-256; never modify a frozen snapshot

import path from "node:path";
import Database from "better-sqlite3";
import { round } from "./comparison-core";
import type { ScoreSummary } from "./comparison-core";
import {
  MATURITY_BANDS,
  DIMENSION_LABELS,
  createSuppressionPolicy,
  type PublishedRunRow,
  type ScoreRow,
  type DimensionRow,
  type Maturity,
  type OverviewExport,
  type DimensionExport,
  type SliceExport,
  type MatrixExport,
  type PeriodManifest,
  type PeriodSnapshot,
} from "./archive-export-types";

export function buildSnapshot(
  db: Database.Database,
  dbPath: string,
  run: PublishedRunRow,
  kAnonymityMin: number,
): PeriodSnapshot {
  console.log(`    · Building snapshot for ${run.period} (codebook ${run.codebook_version})`);
  console.log(`      · Query scores + asset_states…`);
  const tScores0 = performance.now();
  const scores = db
    .prepare(
      `
    SELECT s.overall_score, s.confidence, a.bundesland, a.gewerk_group
    FROM scores s
    JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
    WHERE s.run_id = ?
      AND s.overall_score IS NOT NULL
  `,
    )
    .all(run.run_id) as ScoreRow[];
  console.log(
    `      ✓ scores: ${scores.length} rows (${Math.round(performance.now() - tScores0)} ms)`,
  );

  console.log(`      · Query score_dimensions…`);
  const tDims0 = performance.now();
  const dimensions = db
    .prepare(
      `
    SELECT sd.dimension_id, sd.score, sd.effective_weight
    FROM score_dimensions sd
    JOIN scores s ON s.id = sd.score_id
    WHERE s.run_id = ?
      AND sd.score IS NOT NULL
  `,
    )
    .all(run.run_id) as DimensionRow[];
  console.log(
    `      ✓ dimensions: ${dimensions.length} rows (${Math.round(performance.now() - tDims0)} ms)`,
  );

  console.log(`      · Computing overview…`);
  const overviewScores = scores
    .map((row) => row.overall_score)
    .filter((value): value is number => value != null);

  const overview: OverviewExport = {
    sampleSize: overviewScores.length,
    summary: summarizeNumbers(overviewScores),
    maturity: buildMaturity(overviewScores),
    confidence: summarizeNumbers(
      scores
        .map((row) => row.confidence)
        .filter((value): value is number => Number.isFinite(value)),
    ),
  };

  console.log(`      · Aggregating dimensions…`);
  const dimensionExports = buildDimensions(dimensions, kAnonymityMin);
  console.log(`      ✓ dimensions: ${dimensionExports.length} exports`);

  console.log(`      · Slicing bundeslaender…`);
  const bundeslaender = buildSlices(scores, "bundesland", kAnonymityMin);
  console.log(`      ✓ bundeslaender: ${bundeslaender.length} slices`);

  console.log(`      · Slicing gewerke…`);
  const gewerke = buildSlices(scores, "gewerk_group", kAnonymityMin);
  console.log(`      ✓ gewerke: ${gewerke.length} slices`);

  console.log(`      · Building matrix…`);
  const matrixFull = buildMatrix(scores, kAnonymityMin);
  const matrix = matrixFull.slice(0, 48);
  console.log(`      ✓ matrix: ${matrix.length} display cells (${matrixFull.length} total)`);

  const scoringCodebookVersion =
    (
      db
        .prepare(
          `SELECT codebook_version FROM scores WHERE run_id = ? AND codebook_version IS NOT NULL LIMIT 1`,
        )
        .get(run.run_id) as { codebook_version: string } | undefined
    )?.codebook_version ?? run.codebook_version;

  const manifest: PeriodManifest = {
    period: run.period,
    observatoryRunId: run.run_id,
    factoryRunId: run.factory_run_id,
    bundleHash: run.bundle_hash,
    codebookVersion: scoringCodebookVersion,
    ontologyVersion: run.ontology_version,
    generatedAt: new Date().toISOString(),
    publishedAt: run.published_at ?? run.finished_at ?? new Date().toISOString(),
    kAnonymityMin,
    suppressionPolicy: createSuppressionPolicy(kAnonymityMin),
    sampleSize: overview.sampleSize,
    totalPublishedSlices:
      dimensionExports.length + bundeslaender.length + gewerke.length + matrix.length,
    sourceDb: path.relative(path.resolve(process.cwd(), "../.."), dbPath).replaceAll("\\", "/"),
  };

  console.log(
    `    ✓ Snapshot ${run.period}: N=${overview.sampleSize}, ${dimensionExports.length} dimensions, ${bundeslaender.length} bundeslaender, ${gewerke.length} gewerke, ${matrix.length} matrix`,
  );
  return {
    manifest,
    overview,
    dimensions: dimensionExports,
    bundeslaender,
    gewerke,
    matrix,
    matrixFull,
  };
}

export function buildDimensions(rows: DimensionRow[], kAnonymityMin: number): DimensionExport[] {
  const grouped = new Map<string, { scores: number[]; weight: number }>();
  for (const row of rows) {
    if (row.score == null) continue;
    const existing = grouped.get(row.dimension_id);
    if (existing) {
      existing.scores.push(row.score);
      if (existing.weight === 0 && row.effective_weight > 0) {
        existing.weight = row.effective_weight;
      }
    } else {
      grouped.set(row.dimension_id, {
        scores: [row.score],
        weight: row.effective_weight,
      });
    }
  }

  return [...grouped.entries()]
    .filter(([, value]) => value.scores.length >= kAnonymityMin)
    .map(([id, value]) => ({
      id,
      label: DIMENSION_LABELS[id] ?? id,
      weight: value.weight,
      ...summarizeNumbers(value.scores),
    }))
    .sort((left, right) => right.p75 - left.p75);
}

export function buildSlices(
  rows: ScoreRow[],
  key: "bundesland" | "gewerk_group",
  kAnonymityMin: number,
): SliceExport[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const rawKey = row[key]?.trim();
    if (!rawKey || rawKey === "unknown") continue;
    if (row.overall_score == null) continue;
    const values = grouped.get(rawKey);
    if (values) values.push(row.overall_score);
    else grouped.set(rawKey, [row.overall_score]);
  }

  return [...grouped.entries()]
    .filter(([, values]) => values.length >= kAnonymityMin)
    .map(([id, values]) => ({
      id,
      label: id,
      ...summarizeNumbers(values),
    }))
    .sort((left, right) => {
      const delta = right.p75 - left.p75;
      if (delta !== 0) return delta;
      return left.id.localeCompare(right.id);
    });
}

export function buildMatrix(rows: ScoreRow[], kAnonymityMin: number): MatrixExport[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const bundesland = row.bundesland?.trim();
    const gewerk = row.gewerk_group?.trim();
    if (!bundesland || !gewerk || bundesland === "unknown" || gewerk === "unknown") continue;
    if (row.overall_score == null) continue;
    const key = `${bundesland}__${gewerk}`;
    const values = grouped.get(key);
    if (values) values.push(row.overall_score);
    else grouped.set(key, [row.overall_score]);
  }

  return [...grouped.entries()]
    .filter(([, values]) => values.length >= kAnonymityMin)
    .map(([key, values]) => {
      const [bundesland, gewerk] = key.split("__");
      const summary = summarizeNumbers(values);
      return {
        bundesland: bundesland ?? "unknown",
        gewerk: gewerk ?? "unknown",
        n: summary.n,
        mean: summary.mean,
        p10: summary.p10,
        p25: summary.p25,
        p50: summary.p50,
        p75: summary.p75,
        p90: summary.p90,
      };
    })
    .sort((left, right) => {
      const delta = right.p75 - left.p75;
      if (delta !== 0) return delta;
      return left.bundesland.localeCompare(right.bundesland);
    });
}

export function buildMaturity(scores: number[]): Maturity[] {
  const total = scores.length;
  return MATURITY_BANDS.map((band) => {
    const count = scores.filter((score) => score >= band.min && score < band.max).length;
    return {
      id: band.id,
      label: band.label,
      count,
      share: total > 0 ? count / total : 0,
    };
  });
}

export function summarizeNumbers(values: number[]): ScoreSummary {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { n: 0, mean: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, min: 0, max: 0, stdDev: 0 };
  }
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance =
    sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (sorted.length - 1);
  return {
    n: sorted.length,
    mean: round(mean),
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    min: round(sorted[0] ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
    stdDev: round(Math.sqrt(variance)),
  };
}

export function quantile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return round(sortedValues[lower] ?? 0);
  }
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  return round(lowerValue + (upperValue - lowerValue) * (index - lower));
}
