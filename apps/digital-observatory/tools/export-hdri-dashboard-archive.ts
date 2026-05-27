/*
<MODULE_CONTRACT>
<purpose>Exports a public quarterly HDRI archive and comparison datasets for the hdri-dashboard Astro app.</purpose>
<keywords>dashboard, archive, trends, comparison, k-anonymity, suppression</keywords>
<responsibilities>
  <item>Reads every observatory SQLite database from .output/db.</item>
  <item>Selects canonical published runs across all periods.</item>
  <item>Builds per-period public aggregate JSON payloads for overview, dimensions, bundeslaender, gewerke, and matrix.</item>
  <item>Builds cross-period trend datasets with delta suppression metadata.</item>
  <item>Writes archive.json, latest.json, per-period payloads, and comparison payloads into hdri-dashboard public assets.</item>
  <item>Writes internal debug CSV copies outside deployable Astro public assets.</item>
  <item>Writes public debug copies to .debug-public without domain column/field.</item>
</responsibilities>
<non-goals>
  <item>Do not publish domain names, asset IDs, or per-site remediation details.</item>
  <item>Do not mutate observatory.db contents.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="main">Runs the dashboard archive export workflow.</entry>
  <entry key="collectPublishedRuns">Loads canonical published runs across all observatory DBs.</entry>
  <entry key="buildComparisons">Creates trend datasets with suppression metadata.</entry>
  <entry key="writeDebugPublicCopies">Writes debug copies without domain column/field to .debug-public.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial archive exporter for quarterly public HDRI snapshots and comparisons.</item>
  <item>Add stable comparison categories, explicit comparison manifests, and richer suppression reasons for public trend datasets.</item>
  <item>Add minimal console progress indicators at key milestones to track export without overloading output.</item>
  <item>Add .debug-public folder creation with domain column/field removed from CSV and JSON files.</item>
  <item>Add stdDev to ScoreSummary (sample standard deviation) for richer distribution context.</item>
  <item>Add Reliability type and computeReliability function to ComparisonPoint for delta trust indicators.</item>
  <item>Parallelize DB reads and period writes; simplify previousPeriod resolution; stream-process CSV in writeDebugPublicCopies to cut memory and CPU.</item>
  <item>Export operational codebook YAML as JSON into dashboard public assets for transparency and reproducibility.</item>
  <item>Add granular console progress logging throughout buildSnapshot, writePeriodSnapshot, writeDebugCopies, writeDebugPublicCopies, and buildNamedComparisons so long exports do not appear frozen.</item>
  <item>Restore missing archive.json write that was lost during exporter refactoring; index.astro depends on it.</item>
  <item>Copy raw codebook YAML into dashboard public assets instead of serializing to JSON; dashboard now parses YAML directly at build time.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import Database from 'better-sqlite3';
import { createJsonLogger } from '@org/pipeline-core';

const DASHBOARD_APP_DIR = path.resolve(process.cwd(), '../hdri-dashboard');
const DASHBOARD_DATA_DIR = path.join(DASHBOARD_APP_DIR, 'src', 'assets', 'data');
const DASHBOARD_PUBLIC_DIR = path.join(DASHBOARD_DATA_DIR, 'public');
const DASHBOARD_STATIC_PUBLIC_DIR = path.join(DASHBOARD_APP_DIR, 'public');
const DASHBOARD_DEBUG_DIR = path.join(DASHBOARD_APP_DIR, '.debug');
const DASHBOARD_DEBUG_PUBLIC_DIR = path.join(DASHBOARD_APP_DIR, '.debug-public');
const OUTPUT_DIR = path.resolve(process.cwd(), '.output');
const DB_DIR = path.join(OUTPUT_DIR, 'db');
const MART_DIR = path.join(OUTPUT_DIR, 'mart');
const K_ANONYMITY_MIN = 5;
const DELTA_SUPPRESSION_MIN_ABS = 3;
const DELTA_SUPPRESSION_MIN_RELATIVE = 0.03;
const SUPPRESSION_POLICY = {
  kind: 'k_plus_suppression_diffs',
  kAnonymityMin: K_ANONYMITY_MIN,
  minAbsoluteDelta: DELTA_SUPPRESSION_MIN_ABS,
  minRelativeDelta: DELTA_SUPPRESSION_MIN_RELATIVE,
};

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

type PublishedRunRow = {
  run_id: string;
  period: string;
  codebook_version: string;
  ontology_version: string;
  finished_at: string | null;
  published_at: string | null;
  factory_run_id: string | null;
  bundle_hash: string | null;
};

type ScoreRow = {
  overall_score: number | null;
  confidence: number;
  bundesland: string | null;
  gewerk_group: string | null;
};

type DimensionRow = {
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
  stdDev: number;
};

type Maturity = {
  id: string;
  label: string;
  count: number;
  share: number;
};

type OverviewExport = {
  sampleSize: number;
  summary: ScoreSummary;
  maturity: Maturity[];
  confidence: ScoreSummary;
};

type DimensionExport = ScoreSummary & {
  id: string;
  label: string;
  weight: number;
};

type SliceExport = ScoreSummary & {
  id: string;
  label: string;
};

type MatrixExport = {
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

type PeriodManifest = {
  period: string;
  observatoryRunId: string;
  factoryRunId: string | null;
  bundleHash: string | null;
  codebookVersion: string;
  ontologyVersion: string;
  generatedAt: string;
  publishedAt: string;
  kAnonymityMin: number;
  suppressionPolicy: typeof SUPPRESSION_POLICY;
  sampleSize: number;
  totalPublishedSlices: number;
  sourceDb: string;
};

type ArchiveEntry = {
  period: string;
  manifestPath: string;
  overviewPath: string;
};

type LatestPointer = {
  period: string;
  manifestPath: string;
};

type ComparisonAxis = 'overall' | 'dimension' | 'bundesland' | 'gewerk' | 'matrix';

type ComparisonPresence = 'present' | 'suppressed' | 'absent';

type SuppressionReason =
  | 'no_previous_period'
  | 'current_sample_below_k'
  | 'previous_sample_below_k'
  | 'delta_below_absolute_threshold'
  | 'delta_below_relative_threshold'
  | 'category_absent_current'
  | 'category_absent_previous';

type ComparisonCategoryManifest = {
  key: string;
  label: string;
  firstPeriod: string;
  lastPeriod: string;
  periodsPresent: string[];
};

type ComparisonManifest = {
  axis: ComparisonAxis;
  generatedAt: string;
  suppressionPolicy: typeof SUPPRESSION_POLICY;
  periods: string[];
  categories: ComparisonCategoryManifest[];
};

type PeriodSnapshot = {
  manifest: PeriodManifest;
  overview: OverviewExport;
  dimensions: DimensionExport[];
  bundeslaender: SliceExport[];
  gewerke: SliceExport[];
  matrix: MatrixExport[];
};

type Reliability = 'reliable' | 'caution' | 'suppressed';

type ComparisonPoint = {
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
  reliability: Reliability;
};

const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'dashboard-archive-export' });

async function main(): Promise<void> {
  console.log('📊 HDRI Dashboard Archive Export');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await fs.rm(DASHBOARD_PUBLIC_DIR, { recursive: true, force: true });
  await fs.mkdir(DASHBOARD_PUBLIC_DIR, { recursive: true });
  await fs.mkdir(DASHBOARD_DEBUG_DIR, { recursive: true });
  await fs.mkdir(DASHBOARD_DEBUG_PUBLIC_DIR, { recursive: true });

  const dbPaths = await findObservatoryDbs();
  if (dbPaths.length === 0) {
    throw new Error('No observatory DB files found in .output/db; cannot export dashboard archive');
  }
  console.log(`✓ Found ${dbPaths.length} observatory database(s)`);

  const snapshotGroups = await Promise.all(
    dbPaths.map(async (dbPath) => {
      const db = new Database(dbPath, { readonly: true });
      try {
        const publishedRuns = collectPublishedRuns(db);
        console.log(`  → DB ${path.basename(dbPath)}: ${publishedRuns.length} published run(s)`);
        return publishedRuns.map((run) => buildSnapshot(db, dbPath, run));
      } finally {
        db.close();
      }
    }),
  );
  const snapshots = snapshotGroups.flat();

  snapshots.sort((left, right) => left.manifest.period.localeCompare(right.manifest.period));
  ensureUniquePeriods(snapshots);
  if (snapshots.length === 0) {
    throw new Error('No canonical published runs found; cannot export dashboard archive');
  }
  console.log(`✓ Loaded ${snapshots.length} published period(s)`);

  await Promise.all([
    ...snapshots.map((snapshot) => writePeriodSnapshot(snapshot)),
    ...snapshots.map((snapshot) => writeDebugCopies(snapshot)),
    ...snapshots.map((snapshot) => writeDebugPublicCopies(snapshot)),
  ]);
  console.log(`✓ Wrote ${snapshots.length} period snapshot(s)`);

  const archive: ArchiveEntry[] = snapshots.map((snapshot) => ({
    period: snapshot.manifest.period,
    manifestPath: `periods/${snapshot.manifest.period}/manifest.json`,
    overviewPath: `periods/${snapshot.manifest.period}/overview.json`,
  }));
  const latest = snapshots[snapshots.length - 1]!;
  const latestPointer: LatestPointer = {
    period: latest.manifest.period,
    manifestPath: `periods/${latest.manifest.period}/manifest.json`,
  };

  const comparisonsDir = path.join(DASHBOARD_PUBLIC_DIR, 'comparisons');
  await fs.mkdir(comparisonsDir, { recursive: true });
  const overviewTrendData = buildOverviewTrends(snapshots);
  console.log(`  ✓ Built overview trends: ${overviewTrendData.length} point(s)`);
  const dimensionTrendData = buildNamedComparisons(snapshots, 'dimension');
  const bundeslandTrendData = buildNamedComparisons(snapshots, 'bundesland');
  const gewerkTrendData = buildNamedComparisons(snapshots, 'gewerk');
  const matrixTrendData = buildNamedComparisons(snapshots, 'matrix');
  console.log(`  ✓ All comparisons built`);
  await writeJson(path.join(DASHBOARD_PUBLIC_DIR, 'archive.json'), archive);
  await writeJson(path.join(DASHBOARD_PUBLIC_DIR, 'latest.json'), latestPointer);
  await writeJson(path.join(comparisonsDir, 'overview-trends.json'), overviewTrendData);
  await writeJson(path.join(comparisonsDir, 'overview-manifest.json'), buildComparisonManifest(snapshots, 'overall', overviewTrendData));
  await writeJson(path.join(comparisonsDir, 'dimension-trends.json'), dimensionTrendData);
  await writeJson(path.join(comparisonsDir, 'dimension-manifest.json'), buildComparisonManifest(snapshots, 'dimension', dimensionTrendData));
  await writeJson(path.join(comparisonsDir, 'bundesland-trends.json'), bundeslandTrendData);
  await writeJson(path.join(comparisonsDir, 'bundesland-manifest.json'), buildComparisonManifest(snapshots, 'bundesland', bundeslandTrendData));
  await writeJson(path.join(comparisonsDir, 'gewerk-trends.json'), gewerkTrendData);
  await writeJson(path.join(comparisonsDir, 'gewerk-manifest.json'), buildComparisonManifest(snapshots, 'gewerk', gewerkTrendData));
  await writeJson(path.join(comparisonsDir, 'matrix-trends.json'), matrixTrendData);
  await writeJson(path.join(comparisonsDir, 'matrix-manifest.json'), buildComparisonManifest(snapshots, 'matrix', matrixTrendData));
  console.log(`✓ Built comparison datasets`);

  await writeCodebookYaml();
  console.log(`✓ Exported codebook as YAML`);

  console.log(`✓ Export complete: ${snapshots.length} period(s), latest: ${latest.manifest.period}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  log.info('archive-exported', `Exported ${snapshots.length} published period(s) to ${DASHBOARD_PUBLIC_DIR}`, {
    periodCount: snapshots.length,
    latestPeriod: latest.manifest.period,
  });
}

async function writeCodebookYaml(): Promise<void> {
  const codebookPath = path.resolve(process.cwd(), '.input', 'codebook.yaml');
  const yamlText = await fs.readFile(codebookPath, 'utf-8');
  
  // Extract version from YAML for filename
  const versionMatch = yamlText.match(/^version:\s*"([^"]+)"/m);
  const version = versionMatch ? versionMatch[1] : 'v1.0.0';
  const filename = `codebook-observatory-${version}.yaml`;
  
  // Write to src/assets/data/public for build-time parsing
  const buildDestination = path.join(DASHBOARD_PUBLIC_DIR, filename);
  await fs.writeFile(buildDestination, yamlText, 'utf-8');
  
  // Write to public/ for static download
  await fs.mkdir(DASHBOARD_STATIC_PUBLIC_DIR, { recursive: true });
  const staticDestination = path.join(DASHBOARD_STATIC_PUBLIC_DIR, filename);
  await fs.writeFile(staticDestination, yamlText, 'utf-8');
}

async function findObservatoryDbs(): Promise<string[]> {
  const entries = await fs.readdir(DB_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^observatory_\d{4}\.db$/i.test(entry.name))
    .map((entry) => path.join(DB_DIR, entry.name))
    .sort();
}

function collectPublishedRuns(db: Database.Database): PublishedRunRow[] {
  return db.prepare(`
    SELECT run_id, period, codebook_version, ontology_version, finished_at, published_at, factory_run_id, bundle_hash
    FROM pipeline_runs
    WHERE status = 'finished'
      AND publication_status = 'published'
    ORDER BY period ASC, published_at ASC
  `).all() as PublishedRunRow[];
}

function buildSnapshot(db: Database.Database, dbPath: string, run: PublishedRunRow): PeriodSnapshot {
  console.log(`    · Building snapshot for ${run.period} (codebook ${run.codebook_version})`);
  console.log(`      · Query scores + asset_states…`);
  const tScores0 = performance.now();
  const scores = db.prepare(`
    SELECT s.overall_score, s.confidence, a.bundesland, a.gewerk_group
    FROM scores s
    JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
    WHERE s.run_id = ?
      AND s.overall_score IS NOT NULL
  `).all(run.run_id) as ScoreRow[];
  console.log(`      ✓ scores: ${scores.length} rows (${Math.round(performance.now() - tScores0)} ms)`);

  console.log(`      · Query score_dimensions…`);
  const tDims0 = performance.now();
  const dimensions = db.prepare(`
    SELECT sd.dimension_id, sd.score, sd.effective_weight
    FROM score_dimensions sd
    JOIN scores s ON s.id = sd.score_id
    WHERE s.run_id = ?
      AND sd.score IS NOT NULL
  `).all(run.run_id) as DimensionRow[];
  console.log(`      ✓ dimensions: ${dimensions.length} rows (${Math.round(performance.now() - tDims0)} ms)`);

  console.log(`      · Computing overview…`);
  const overviewScores = scores
    .map((row) => row.overall_score)
    .filter((value): value is number => value != null);

  const overview: OverviewExport = {
    sampleSize: overviewScores.length,
    summary: summarizeNumbers(overviewScores),
    maturity: buildMaturity(overviewScores),
    confidence: summarizeNumbers(
      scores.map((row) => row.confidence).filter((value): value is number => Number.isFinite(value)),
    ),
  };

  console.log(`      · Aggregating dimensions…`);
  const dimensionExports = buildDimensions(dimensions);
  console.log(`      ✓ dimensions: ${dimensionExports.length} exports`);

  console.log(`      · Slicing bundeslaender…`);
  const bundeslaender = buildSlices(scores, 'bundesland');
  console.log(`      ✓ bundeslaender: ${bundeslaender.length} slices`);

  console.log(`      · Slicing gewerke…`);
  const gewerke = buildSlices(scores, 'gewerk_group');
  console.log(`      ✓ gewerke: ${gewerke.length} slices`);

  console.log(`      · Building matrix…`);
  const matrix = buildMatrix(scores);
  console.log(`      ✓ matrix: ${matrix.length} cells`);

  const manifest: PeriodManifest = {
    period: run.period,
    observatoryRunId: run.run_id,
    factoryRunId: run.factory_run_id,
    bundleHash: run.bundle_hash,
    codebookVersion: run.codebook_version,
    ontologyVersion: run.ontology_version,
    generatedAt: new Date().toISOString(),
    publishedAt: run.published_at ?? run.finished_at ?? new Date().toISOString(),
    kAnonymityMin: K_ANONYMITY_MIN,
    suppressionPolicy: SUPPRESSION_POLICY,
    sampleSize: overview.sampleSize,
    totalPublishedSlices: dimensionExports.length + bundeslaender.length + gewerke.length + matrix.length,
    sourceDb: path.relative(path.resolve(process.cwd(), '../..'), dbPath).replaceAll('\\', '/'),
  };

  console.log(`    ✓ Snapshot ${run.period}: N=${overview.sampleSize}, ${dimensionExports.length} dimensions, ${bundeslaender.length} bundeslaender, ${gewerke.length} gewerke, ${matrix.length} matrix`);
  return {
    manifest,
    overview,
    dimensions: dimensionExports,
    bundeslaender,
    gewerke,
    matrix,
  };
}

function ensureUniquePeriods(snapshots: PeriodSnapshot[]): void {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.manifest.period)) {
      throw new Error(`Multiple published runs found for period ${snapshot.manifest.period}; archive export requires exactly one canonical run per period`);
    }
    seen.add(snapshot.manifest.period);
  }
}

async function writePeriodSnapshot(snapshot: PeriodSnapshot): Promise<void> {
  console.log(`  · Writing public snapshot for ${snapshot.manifest.period}`);
  const periodDir = path.join(DASHBOARD_PUBLIC_DIR, 'periods', snapshot.manifest.period);
  await fs.mkdir(periodDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(periodDir, 'manifest.json'), snapshot.manifest),
    writeJson(path.join(periodDir, 'overview.json'), snapshot.overview),
    writeJson(path.join(periodDir, 'dimensions.json'), snapshot.dimensions),
    writeJson(path.join(periodDir, 'bundeslaender.json'), snapshot.bundeslaender),
    writeJson(path.join(periodDir, 'gewerke.json'), snapshot.gewerke),
    writeJson(path.join(periodDir, 'matrix.json'), snapshot.matrix),
  ]);
}

async function writeDebugCopies(snapshot: PeriodSnapshot): Promise<void> {
  console.log(`  · Writing debug copies for ${snapshot.manifest.period}`);
  const debugDir = path.join(DASHBOARD_DEBUG_DIR, snapshot.manifest.period, snapshot.manifest.observatoryRunId);
  await fs.mkdir(debugDir, { recursive: true });
  const files = ['site-scores.csv', 'remediation-report.csv', 'cohort-aggregates.json'];
  for (const fileName of files) {
    const source = path.join(MART_DIR, fileName);
    const destination = path.join(debugDir, fileName);
    try {
      await fs.copyFile(source, destination);
    } catch {
      await fs.writeFile(destination, '', 'utf-8');
    }
  }
}

async function writeDebugPublicCopies(snapshot: PeriodSnapshot): Promise<void> {
  console.log(`  · Writing public debug copies for ${snapshot.manifest.period}`);
  const debugPublicDir = path.join(DASHBOARD_DEBUG_PUBLIC_DIR, snapshot.manifest.period, snapshot.manifest.observatoryRunId);
  await fs.mkdir(debugPublicDir, { recursive: true });
  const files = ['site-scores.csv', 'remediation-report.csv', 'cohort-aggregates.json'];
  for (const fileName of files) {
    const source = path.join(MART_DIR, fileName);
    const destination = path.join(debugPublicDir, fileName);
    try {
      if (fileName.endsWith('.csv')) {
        await stripDomainColumn(source, destination);
      } else if (fileName.endsWith('.json')) {
        const content = await fs.readFile(source, 'utf-8');
        const data = JSON.parse(content) as Array<Record<string, unknown>>;
        const filteredData = data.map((item) => {
          const { domain: _domain, ...rest } = item;
          return rest;
        });
        await fs.writeFile(destination, JSON.stringify(filteredData, null, 2), 'utf-8');
      } else {
        await fs.copyFile(source, destination);
      }
    } catch {
      await fs.writeFile(destination, '', 'utf-8');
    }
  }
}

async function stripDomainColumn(inputPath: string, outputPath: string): Promise<void> {
  const input = createReadStream(inputPath, 'utf-8');
  const output = createWriteStream(outputPath, 'utf-8');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let domainIndex = -1;
  let headerProcessed = false;

  for await (const line of rl) {
    if (!headerProcessed) {
      headerProcessed = true;
      const headers: string[] = [];
      let start = 0;
      for (let i = 0; i <= line.length; i++) {
        if (i === line.length || line[i] === ',') {
          headers.push(line.slice(start, i));
          start = i + 1;
        }
      }
      domainIndex = headers.indexOf('domain');
      if (domainIndex === -1) {
        output.write(line + '\n');
      } else {
        headers.splice(domainIndex, 1);
        output.write(headers.join(',') + '\n');
      }
      continue;
    }

    if (domainIndex === -1) {
      output.write(line + '\n');
      continue;
    }

    let col = 0;
    let start = 0;
    let out = '';
    for (let i = 0; i <= line.length; i++) {
      if (i === line.length || line[i] === ',') {
        if (col !== domainIndex) {
          out += (out.length ? ',' : '') + line.slice(start, i);
        }
        col++;
        start = i + 1;
      }
    }
    output.write(out + '\n');
  }

  output.end();
  await new Promise<void>((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
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
    const values = grouped.get(rawKey);
    if (values) values.push(row.overall_score);
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

function buildMatrix(rows: ScoreRow[]): MatrixExport[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const bundesland = row.bundesland?.trim();
    const gewerk = row.gewerk_group?.trim();
    if (!bundesland || !gewerk || bundesland === 'unknown' || gewerk === 'unknown') continue;
    if (row.overall_score == null) continue;
    const key = `${bundesland}__${gewerk}`;
    const values = grouped.get(key);
    if (values) values.push(row.overall_score);
    else grouped.set(key, [row.overall_score]);
  }

  return [...grouped.entries()]
    .filter(([, values]) => values.length >= K_ANONYMITY_MIN)
    .map(([key, values]) => {
      const [bundesland, gewerk] = key.split('__');
      const summary = summarizeNumbers(values);
      return {
        bundesland: bundesland ?? 'unknown',
        gewerk: gewerk ?? 'unknown',
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

function buildMaturity(scores: number[]): Maturity[] {
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

function buildOverviewTrends(snapshots: PeriodSnapshot[]): ComparisonPoint[] {
  return snapshots.map((snapshot, index) => {
    const previous = index > 0 ? snapshots[index - 1] : null;
    const currentSummary = snapshot.overview.summary;
    const previousSummary = previous?.overview.summary ?? null;
    return createComparisonPoint({
      axis: 'overall',
      period: snapshot.manifest.period,
      previousPeriod: previous?.manifest.period ?? null,
      label: 'HDRI Gesamt',
      key: 'overall',
      current: currentSummary,
      previous: previousSummary,
      currentPresent: true,
      previousPresent: previousSummary !== null,
    });
  });
}

function buildNamedComparisons(
  snapshots: PeriodSnapshot[],
  axis: 'dimension' | 'bundesland' | 'gewerk' | 'matrix',
): ComparisonPoint[] {
  console.log(`  · Building ${axis} comparisons across ${snapshots.length} period(s)`);
  const rows: ComparisonPoint[] = [];
  const universe = buildAxisUniverse(snapshots, axis);
  let previousMap = new Map<string, { label: string; summary: ScoreSummary }>();

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i]!;
    const currentEntries = getAxisEntries(snapshot, axis);
    const currentMap = new Map<string, { label: string; summary: ScoreSummary }>();
    for (const entry of currentEntries) {
      currentMap.set(entry.key, { label: entry.label, summary: entry.summary });
    }

    for (const category of universe) {
      const current = currentMap.get(category.key) ?? null;
      const previous = previousMap.get(category.key) ?? null;
      rows.push(createComparisonPoint({
        axis,
        period: snapshot.manifest.period,
        previousPeriod: previousMap.size > 0 && i > 0 ? snapshots[i - 1]!.manifest.period : null,
        label: current?.label ?? previous?.label ?? category.label,
        key: category.key,
        current: current?.summary ?? null,
        previous: previous?.summary ?? null,
        currentPresent: current !== null,
        previousPresent: previous !== null,
      }));
    }

    previousMap = currentMap;
  }

  return rows;
}

function buildAxisUniverse(
  snapshots: PeriodSnapshot[],
  axis: 'dimension' | 'bundesland' | 'gewerk' | 'matrix',
): Array<{ key: string; label: string }> {
  const universe = new Map<string, string>();
  for (const snapshot of snapshots) {
    for (const entry of getAxisEntries(snapshot, axis)) {
      if (!universe.has(entry.key)) {
        universe.set(entry.key, entry.label);
      }
    }
  }
  return [...universe.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function buildComparisonManifest(
  snapshots: PeriodSnapshot[],
  axis: ComparisonAxis,
  rows: ComparisonPoint[],
): ComparisonManifest {
  const periodSet = snapshots.map((snapshot) => snapshot.manifest.period);
  const categoryMap = new Map<string, ComparisonCategoryManifest>();
  for (const row of rows) {
    if (row.currentStatus === 'absent') {
      continue;
    }
    const existing = categoryMap.get(row.key);
    if (existing) {
      existing.lastPeriod = row.period;
      if (!existing.periodsPresent.includes(row.period)) {
        existing.periodsPresent.push(row.period);
      }
    } else {
      categoryMap.set(row.key, {
        key: row.key,
        label: row.label,
        firstPeriod: row.period,
        lastPeriod: row.period,
        periodsPresent: [row.period],
      });
    }
  }

  return {
    axis,
    generatedAt: new Date().toISOString(),
    suppressionPolicy: SUPPRESSION_POLICY,
    periods: periodSet,
    categories: [...categoryMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function getAxisEntries(
  snapshot: PeriodSnapshot,
  axis: 'dimension' | 'bundesland' | 'gewerk' | 'matrix',
): Array<{ key: string; label: string; summary: ScoreSummary }> {
  switch (axis) {
    case 'dimension':
      return snapshot.dimensions.map((item) => ({ key: item.id, label: item.label, summary: item }));
    case 'bundesland':
      return snapshot.bundeslaender.map((item) => ({ key: item.id, label: item.label, summary: item }));
    case 'gewerk':
      return snapshot.gewerke.map((item) => ({ key: item.id, label: item.label, summary: item }));
    case 'matrix':
      return snapshot.matrix.map((item) => ({
        key: `${item.bundesland}__${item.gewerk}`,
        label: `${item.bundesland} × ${item.gewerk}`,
        summary: {
          n: item.n,
          mean: item.mean,
          p10: item.p10,
          p25: item.p25,
          p50: item.p50,
          p75: item.p75,
          p90: item.p90,
          min: item.p25,
          max: item.p75,
          stdDev: 0,
        },
      }));
  }
}

function computeReliability(
  current: ScoreSummary | null,
  previous: ScoreSummary | null,
  delta: number | null,
  suppressionReasons: SuppressionReason[],
): Reliability {
  if (suppressionReasons.length > 0) return 'suppressed';
  if (!current || !previous) return 'suppressed';
  const currentN = current.n;
  const previousN = previous.n;
  if (currentN < 30 || previousN < 30) return 'caution';
  if (delta == null) return 'caution';
  if (Math.abs(delta) < 3) return 'caution';
  return 'reliable';
}

function createComparisonPoint(input: {
  axis: ComparisonPoint['axis'];
  period: string;
  previousPeriod: string | null;
  label: string;
  key: string;
  current: ScoreSummary | null;
  previous: ScoreSummary | null;
  currentPresent: boolean;
  previousPresent: boolean;
}): ComparisonPoint {
  const currentSummary = input.current ?? emptySummary();
  const delta = input.current && input.previous ? round(input.current.p75 - input.previous.p75) : null;
  const suppressionReasons = getSuppressionReasons({
    current: input.current,
    previous: input.previous,
    delta,
    currentPresent: input.currentPresent,
    previousPresent: input.previousPresent,
  });
  const reliability = computeReliability(input.current, input.previous, delta, suppressionReasons);
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
    currentStatus: !input.currentPresent ? 'absent' : suppressionReasons.length > 0 ? 'suppressed' : 'present',
    previousStatus: !input.previousPresent ? 'absent' : input.previous ? 'present' : 'suppressed',
    deltaFromPrevious: suppressionReasons.length > 0 ? null : delta,
    suppressionReasons,
    reliability,
  };
}

function getSuppressionReasons(input: {
  current: ScoreSummary | null;
  previous: ScoreSummary | null;
  delta: number | null;
  currentPresent: boolean;
  previousPresent: boolean;
}): SuppressionReason[] {
  const reasons: SuppressionReason[] = [];
  if (!input.currentPresent) {
    reasons.push('category_absent_current');
    return reasons;
  }
  if (!input.previousPresent) {
    reasons.push('no_previous_period');
    return reasons;
  }
  if (!input.previous) {
    reasons.push('category_absent_previous');
    return reasons;
  }
  if (!input.current) {
    reasons.push('category_absent_current');
    return reasons;
  }
  if (input.current.n < K_ANONYMITY_MIN) {
    reasons.push('current_sample_below_k');
  }
  if (input.previous.n < K_ANONYMITY_MIN) {
    reasons.push('previous_sample_below_k');
  }
  if (input.delta == null) {
    return reasons;
  }
  const absDelta = Math.abs(input.delta);
  if (absDelta < DELTA_SUPPRESSION_MIN_ABS) {
    reasons.push('delta_below_absolute_threshold');
  }
  const baseline = Math.max(Math.abs(input.previous.p75), 1);
  if (absDelta / baseline < DELTA_SUPPRESSION_MIN_RELATIVE) {
    reasons.push('delta_below_relative_threshold');
  }
  return [...new Set(reasons)];
}

function emptySummary(): ScoreSummary {
  return { n: 0, mean: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, min: 0, max: 0, stdDev: 0 };
}

function summarizeNumbers(values: number[]): ScoreSummary {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { n: 0, mean: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, min: 0, max: 0, stdDev: 0 };
  }
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (sorted.length - 1);
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

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

void main().catch((error: unknown) => {
  log.error('failed', '[export-hdri-dashboard-archive] Failed:', { error: String(error) });
  process.exitCode = 1;
});
