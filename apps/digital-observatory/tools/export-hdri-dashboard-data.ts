/*
<MODULE_CONTRACT>
<purpose>Exports privacy-safe HDRI dashboard JSON and debug CSV files from observatory output into the hdri-dashboard Astro app assets.</purpose>
<keywords>dashboard, export, astro, k-anonymity, json, csv, observatory</keywords>
<responsibilities>
  <item>Reads the latest observatory SQLite database from .output/db.</item>
  <item>Selects the latest completed observatory run and its scored assets.</item>
  <item>Builds public aggregate JSON payloads for overview, dimensions, bundeslaender, gewerke, and matrix.</item>
  <item>Applies k-anonymity filtering to every published slice.</item>
  <item>Copies mart CSV files into the dashboard debug-csv asset folder.</item>
</responsibilities>
<non-goals>
  <item>Do not publish domain names, asset IDs, or per-site remediation details.</item>
  <item>Do not mutate observatory.db.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main">Runs the dashboard export workflow.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for hdri-dashboard static asset export.</item>
  <item>Replace raw console.log/console.error with structured NDJSON logger from @org/pipeline-core.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createJsonLogger } from '@org/pipeline-core';

type RunRow = {
  run_id: string;
  period: string;
  codebook_version: string;
  started_at: string;
  finished_at: string | null;
};

type ScoreRow = {
  asset_id: string;
  overall_score: number | null;
  confidence: number;
  bundesland: string | null;
  gewerk_group: string | null;
  destatis_group: string | null;
};

type DimensionRow = {
  asset_id: string;
  dimension_id: string;
  score: number | null;
  effective_weight: number;
};

type ScoreSummary = {
  n: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
};

type PublishedSummary = ScoreSummary & {
  label: string;
};

type DimensionExport = PublishedSummary & {
  id: string;
  weight: number;
};

type SliceExport = PublishedSummary & {
  id: string;
};

type MatrixCell = {
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

type Manifest = {
  generatedAt: string;
  kAnonymityMin: number;
  period: string | null;
  runId: string | null;
  codebookVersion: string | null;
  sourceDb: string | null;
  totalPublishedSlices: number;
};

const DASHBOARD_APP_DIR = path.resolve(process.cwd(), '../hdri-dashboard');
const DASHBOARD_DATA_DIR = path.join(DASHBOARD_APP_DIR, 'src', 'assets', 'data');
const DASHBOARD_DEBUG_CSV_DIR = path.join(DASHBOARD_DATA_DIR, 'debug-csv');
const OUTPUT_DIR = path.resolve(process.cwd(), '.output');
const DB_DIR = path.join(OUTPUT_DIR, 'db');
const MART_DIR = path.join(OUTPUT_DIR, 'mart');
const K_ANONYMITY_MIN = 5;
const MATURITY_BANDS = [
  { id: 'kritisch', label: 'Kritisch', min: 0, max: 20 },
  { id: 'basis', label: 'Basis', min: 20, max: 40 },
  { id: 'aufbau', label: 'Aufbau', min: 40, max: 60 },
  { id: 'fortgeschritten', label: 'Fortgeschritten', min: 60, max: 80 },
  { id: 'vorbild', label: 'Vorbild', min: 80, max: 101 },
] as const;
const DIMENSION_LABELS: Record<string, string> = {
  legal_compliance: 'Recht & Pflichtangaben',
  contact_accessibility: 'Kontakt & Erreichbarkeit',
  structured_data: 'Strukturierte Informationen',
  trust_signals: 'Vertrauen & Nachweise',
  social_presence: 'Soziale Präsenz',
  accessibility_audit: 'Barrierefreiheit',
};

const log = createJsonLogger({ app: 'digital-observatory', gogol: 'export-hdri-dashboard-data' });

async function main(): Promise<void> {
  await fs.mkdir(DASHBOARD_DATA_DIR, { recursive: true });
  await fs.mkdir(DASHBOARD_DEBUG_CSV_DIR, { recursive: true });

  const dbPath = await findLatestObservatoryDb();
  if (!dbPath) {
    await writeEmptyPayloads();
    log.info('no-db', 'No observatory DB found. Wrote empty dashboard payloads.');
    return;
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const run = selectLatestRun(db);
    if (!run) {
      await writeEmptyPayloads(dbPath);
      log.info('no-run', 'No completed run found. Wrote empty dashboard payloads.');
      return;
    }

    const scores = db.prepare(`
      SELECT
        s.asset_id,
        s.overall_score,
        s.confidence,
        a.bundesland,
        a.gewerk_group,
        m.target_code AS destatis_group
      FROM scores s
      JOIN asset_states a ON a.asset_id = s.asset_id AND a.valid_to IS NULL
      LEFT JOIN asset_hwo_mappings m ON m.asset_id = s.asset_id AND m.mapping_system = 'destatis_group'
      WHERE s.run_id = ?
        AND s.overall_score IS NOT NULL
    `).all(run.run_id) as ScoreRow[];

    const dimensions = db.prepare(`
      SELECT s.asset_id, sd.dimension_id, sd.score, sd.effective_weight
      FROM score_dimensions sd
      JOIN scores s ON s.id = sd.score_id
      WHERE s.run_id = ?
        AND sd.score IS NOT NULL
    `).all(run.run_id) as DimensionRow[];

    const overviewScores = scores
      .map((row) => row.overall_score)
      .filter((value): value is number => value != null);

    const overview = {
      sampleSize: overviewScores.length,
      summary: summarizeNumbers(overviewScores),
      maturity: buildMaturity(overviewScores),
      confidence: summarizeNumbers(
        scores
          .map((row) => row.confidence)
          .filter((value): value is number => Number.isFinite(value)),
      ),
    };

    const dimensionsExport = buildDimensions(dimensions);
    const bundeslaender = buildSlices(scores, 'bundesland');
    const gewerke = buildSlices(scores, 'gewerk_group');
    const matrix = buildMatrix(scores);
    const manifest: Manifest = {
      generatedAt: new Date().toISOString(),
      kAnonymityMin: K_ANONYMITY_MIN,
      period: run.period,
      runId: run.run_id,
      codebookVersion: run.codebook_version,
      sourceDb: path.relative(path.resolve(process.cwd(), '../..'), dbPath).replaceAll('\\', '/'),
      totalPublishedSlices: dimensionsExport.length + bundeslaender.length + gewerke.length + matrix.length,
    };

    await Promise.all([
      writeJson('manifest.json', manifest),
      writeJson('overview.json', overview),
      writeJson('dimensions.json', dimensionsExport),
      writeJson('bundeslaender.json', bundeslaender),
      writeJson('gewerke.json', gewerke),
      writeJson('matrix.json', matrix),
    ]);

    await copyDebugCsvs();

    log.info('exported', `Exported run ${run.run_id} (${run.period}) to ${DASHBOARD_DATA_DIR}`, {
      runId: run.run_id,
      period: run.period,
      dashboardDataDir: DASHBOARD_DATA_DIR,
    });
  } finally {
    db.close();
  }
}

async function findLatestObservatoryDb(): Promise<string | null> {
  try {
    const entries = await fs.readdir(DB_DIR, { withFileTypes: true });
    const dbFiles = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^observatory_\d{4}\.db$/i.test(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(DB_DIR, entry.name);
          const stats = await fs.stat(fullPath);
          return { fullPath, mtimeMs: stats.mtimeMs };
        }),
    );
    dbFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return dbFiles[0]?.fullPath ?? null;
  } catch {
    return null;
  }
}

function selectLatestRun(db: Database.Database): RunRow | null {
  return db.prepare(`
    SELECT run_id, period, codebook_version, started_at, finished_at
    FROM pipeline_runs
    WHERE status = 'finished'
    ORDER BY COALESCE(finished_at, started_at) DESC
    LIMIT 1
  `).get() as RunRow | null;
}

function buildDimensions(rows: DimensionRow[]): DimensionExport[] {
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
    .filter(([, value]) => value.scores.length >= K_ANONYMITY_MIN)
    .map(([id, value]) => ({
      id,
      label: DIMENSION_LABELS[id] ?? id,
      weight: value.weight,
      ...summarizeNumbers(value.scores),
    }))
    .sort((left, right) => right.p75 - left.p75);
}

function buildSlices(rows: ScoreRow[], key: 'bundesland' | 'gewerk_group'): SliceExport[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const rawKey = row[key]?.trim();
    if (!rawKey || rawKey === 'unknown') continue;
    if (row.overall_score == null) continue;
    const arr = grouped.get(rawKey);
    if (arr) arr.push(row.overall_score);
    else grouped.set(rawKey, [row.overall_score]);
  }

  return [...grouped.entries()]
    .filter(([, values]) => values.length >= K_ANONYMITY_MIN)
    .map(([id, values]) => ({
      id,
      label: id,
      ...summarizeNumbers(values),
    }))
    .sort((left, right) => right.p75 - left.p75);
}

function buildMatrix(rows: ScoreRow[]): MatrixCell[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const bundesland = row.bundesland?.trim();
    const gewerk = row.gewerk_group?.trim();
    if (!bundesland || !gewerk || bundesland === 'unknown' || gewerk === 'unknown') continue;
    if (row.overall_score == null) continue;
    const key = `${bundesland}__${gewerk}`;
    const arr = grouped.get(key);
    if (arr) arr.push(row.overall_score);
    else grouped.set(key, [row.overall_score]);
  }

  return [...grouped.entries()]
    .filter(([, values]) => values.length >= K_ANONYMITY_MIN)
    .map(([key, values]) => {
      const [bundesland, gewerk] = key.split('__');
      const summary = summarizeNumbers(values);
      return {
        bundesland,
        gewerk,
        n: summary.n,
        mean: summary.mean,
        p10: summary.p10,
        p25: summary.p25,
        p50: summary.p50,
        p75: summary.p75,
        p90: summary.p90,
      };
    })
    .sort((left, right) => right.p75 - left.p75)
    .slice(0, 48);
}

function buildMaturity(scores: number[]): Array<{ id: string; label: string; count: number; share: number }> {
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

function summarizeNumbers(values: number[]): ScoreSummary {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { n: 0, mean: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, min: 0, max: 0 };
  }
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
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
  };
}

function quantile(sortedValues: number[], ratio: number): number {
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

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

async function writeJson(fileName: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(DASHBOARD_DATA_DIR, fileName), JSON.stringify(data, null, 2), 'utf-8');
}

async function writeEmptyPayloads(dbPath?: string): Promise<void> {
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    kAnonymityMin: K_ANONYMITY_MIN,
    period: null,
    runId: null,
    codebookVersion: null,
    sourceDb: dbPath
      ? path.relative(path.resolve(process.cwd(), '../..'), dbPath).replaceAll('\\', '/')
      : null,
    totalPublishedSlices: 0,
  };

  await Promise.all([
    writeJson('manifest.json', manifest),
    writeJson('overview.json', {
      sampleSize: 0,
      summary: summarizeNumbers([]),
      maturity: buildMaturity([]),
      confidence: summarizeNumbers([]),
    }),
    writeJson('dimensions.json', []),
    writeJson('bundeslaender.json', []),
    writeJson('gewerke.json', []),
    writeJson('matrix.json', []),
  ]);

  await copyDebugCsvs();
}

async function copyDebugCsvs(): Promise<void> {
  const expectedFiles = ['site-scores.csv', 'remediation-report.csv'];
  for (const fileName of expectedFiles) {
    const source = path.join(MART_DIR, fileName);
    const destination = path.join(DASHBOARD_DEBUG_CSV_DIR, fileName);
    try {
      await fs.copyFile(source, destination);
    } catch {
      await fs.writeFile(destination, '', 'utf-8');
    }
  }
}

void main().catch((error: unknown) => {
  log.error('failed', '[export-hdri-dashboard-data] Failed:', { error: String(error) });
  process.exitCode = 1;
});
