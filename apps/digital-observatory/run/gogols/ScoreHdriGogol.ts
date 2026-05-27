/*
<MODULE_CONTRACT>
<purpose>Reads observations, builds SiteSignals per asset, scores via HDRI codebook, writes results.</purpose>
<keywords>scoring, hdri, codebook, observations</keywords>
<responsibilities>
  <item>Loads the codebook YAML from .input/codebook.yaml or embedded default.</item>
  <item>Reads latest observations per asset from observatory.db.</item>
  <item>Converts observations into SiteSignals keyed by signal_path.</item>
  <item>Calls scoreSite() for each asset and writes scores + traces.</item>
  <item>Writes computation_hash per score for theory reconstruction.</item>
</responsibilities>
<non-goals>
  <item>Do not aggregate scores — that is done by build-cohorts.</item>
  <item>Do not modify observations.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ScoreHdriGogol">Gogol class for HDRI scoring.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>P0.4: use factory_run_id instead of run_id for matching synced bundles.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Add single-line progress reporting while scoring large asset batches.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { scoreSite, parseCodebookOrThrow } from '@org/hdri-codebook';
import type {
  Codebook, Indicator, SiteSignals, SiteSignalStatuses,
} from '@org/hdri-codebook';
import { computationHash, newId, parsePeriod, readOntologyFile } from '@org/observatory-core';
import type { SignalCollectionStatus, SignalOntology } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';
import { inputDir } from '../config';

type ObsRow = {
  id: string;
  asset_id: string;
  signal_path: string;
  value_bool: number | null;
  value_num: number | null;
  value_str: string | null;
  value_json: string | null;
  value_type: string;
  collection_status: string | null;
  extractor_version: string | null;
};

/** Per-asset payload assembled from observations. */
type AssetSignalBundle = {
  signals: SiteSignals;
  statuses: SiteSignalStatuses;
  /** Observation IDs that contributed to this asset's signals. */
  observationIds: string[];
  /** signal_path → probe_version observed (informational provenance). */
  actualExtractors: Record<string, string | null>;
};

const CONDITIONAL_STATUSES = new Set<SignalCollectionStatus>([
  'absent', 'unreachable', 'forbidden', 'not_applicable',
]);

export class ScoreHdriGogol extends Gogol {
  override readonly id = 'score-hdri';

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error('Missing run_id — setup-observatory-run must run first');
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const runId = ctx.state.runId!;
    const now = new Date().toISOString();
    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    // Load codebook
    const codebook = await loadCodebook();
    log.info('codebook-loaded', `Codebook: ${codebook.id} v${codebook.version}, ${codebook.dimensions.length} dimensions`, {
      codebookId: codebook.id,
      codebookVersion: codebook.version,
      dimensions: codebook.dimensions.length,
    });

    // Load ontology and cross-validate every codebook inputKey against it.
    // Fail-fast on rename/typo before scoring; warn on deprecated signals.
    const ontology = await loadOntologyForCodebook(codebook, log);
    if (ontology) {
      crossValidateCodebookAgainstOntology(codebook, ontology, log);
    }

    const year = parsePeriod(ctx.state.brief.period).year;

    // Build a fast lookup of codebook indicators by (dimensionId, indicatorId).
    const indicatorIndex = buildIndicatorIndex(codebook);

    // Read observations grouped by asset_id, scoped to this observatory run.
    // observations.run_id is always the OBSERVATORY runId (set consistently by both
    // SyncFromFactoryGogol and legacy paths). observations.factory_run_id holds the
    // factory manifest run_id for bundle-synced observations.
    // The OR clause covers both: legacy (run_id match) and bundle (factory_run_id match
    // through synced_bundles).
    const obsDb = openObservatoryDb(year);
    let assetBundles: Map<string, AssetSignalBundle>;

    try {
      const rows = obsDb.prepare(`
        SELECT id, asset_id, signal_path, value_bool, value_num, value_str, value_json,
               value_type, collection_status, extractor_version
        FROM observations
        WHERE status = 'active'
          AND (
            run_id = ?
            OR factory_run_id IN (SELECT run_id FROM synced_bundles WHERE observatory_run_id = ?)
          )
        ORDER BY asset_id
      `).all(runId, runId) as ObsRow[];

      assetBundles = buildAssetBundles(rows);
    } finally {
      obsDb.close();
    }

    log.info('scoring-assets', `Scoring ${assetBundles.size} assets`, { assetCount: assetBundles.size });

    // Score each asset and write to DB
    const db = openObservatoryDb(year);
    let scored = 0;
    let skipped = 0;

    try {
      const insertScore = db.prepare(`
        INSERT OR IGNORE INTO scores
          (id, asset_id, codebook_id, codebook_version, overall_score, confidence,
           computation_hash, run_id, scored_at, period)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertDim = db.prepare(`
        INSERT OR IGNORE INTO score_dimensions
          (score_id, dimension_id, score, confidence, effective_weight)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertTrace = db.prepare(`
        INSERT INTO score_indicator_traces
          (score_id, dimension_id, indicator_id, input_key, raw_value,
           rule_type, score, weight, confidence, note,
           remediation_json, declared_extractor, actual_extractor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const scoreBatch = db.transaction(() => {
        let processed = 0;
        for (const [assetId, bundle] of assetBundles) {
          const result = scoreSite(bundle.signals, codebook, {
            signalStatuses: bundle.statuses,
          });

          if (result.overallScore === null) {
            skipped += 1;
            processed += 1;
            logProgress(this.id, processed, assetBundles.size, 1000, true);
            continue;
          }

          const scoreId = newId();
          const obsIds = bundle.observationIds;
          const compHash = computationHash(
            codebook.version,
            obsIds,
          );

          insertScore.run(
            scoreId,
            assetId,
            codebook.id,
            codebook.version,
            result.overallScore,
            result.confidence,
            compHash,
            runId,
            now,
            ctx.state.brief.period,
          );

          for (const dim of result.dimensions) {
            insertDim.run(
              scoreId,
              dim.dimensionId,
              dim.score,
              dim.confidence,
              dim.effectiveWeight,
            );
          }

          for (const trace of result.trace) {
            const ind = indicatorIndex.get(`${trace.dimensionId}/${trace.indicatorId}`);
            const remediationJson = ind?.remediation
              ? JSON.stringify(ind.remediation)
              : null;
            const declaredExtractor = ind?.source?.extractor ?? null;
            const actualExtractor = bundle.actualExtractors[trace.inputKey] ?? null;

            insertTrace.run(
              scoreId,
              trace.dimensionId,
              trace.indicatorId,
              trace.inputKey,
              trace.rawValue != null ? String(trace.rawValue) : null,
              trace.rule,
              trace.score,
              trace.weight,
              trace.confidence,
              trace.note ?? null,
              remediationJson,
              declaredExtractor,
              actualExtractor,
            );
          }

          scored += 1;
          processed += 1;
          logProgress(this.id, processed, assetBundles.size, 1000, true);
        }
      });

      scoreBatch();
    } finally {
      db.close();
    }

    ctx.state.scoreCount = scored;

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'score-summary.json'),
      JSON.stringify({
        scored,
        skipped,
        total: assetBundles.size,
        codebook_id: codebook.id,
        codebook_version: codebook.version,
        run_id: runId,
      }, null, 2),
    );

    log.info('scoring-finished', `Done. ${scored} scored, ${skipped} skipped (null overall).`, { scored, skipped });
  }
}

async function loadCodebook(): Promise<Codebook> {
  const codebookPath = path.join(inputDir, 'codebook.yaml');
  const source = await fs.readFile(codebookPath, 'utf-8');
  return parseCodebookOrThrow(source, codebookPath);
}

/**
 * Loads the ontology referenced by the codebook (codebook.ontologyRef → resolved
 * relative to .input/). Returns null if no ontologyRef is declared (legacy mode).
 */
async function loadOntologyForCodebook(
  codebook: Codebook,
  log: import('@org/pipeline-core').JsonLogger,
): Promise<SignalOntology | null> {
  if (!codebook.ontologyRef) return null;
  const ontologyPath = path.isAbsolute(codebook.ontologyRef)
    ? codebook.ontologyRef
    : path.join(inputDir, codebook.ontologyRef);
  try {
    const ontology = await readOntologyFile(ontologyPath);
    log.info('ontology-loaded', `Ontology: v${ontology.version}, ${Object.keys(ontology.signals).length} signals`, {
      ontologyVersion: ontology.version,
      signalCount: Object.keys(ontology.signals).length,
    });
    return ontology;
  } catch (err) {
    throw new Error(
      `[score-hdri] Failed to load ontologyRef="${codebook.ontologyRef}" — ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/**
 * Cross-validates that every codebook inputKey exists in the ontology.
 * Throws on unknown signals; warns on deprecated ones.
 */
function crossValidateCodebookAgainstOntology(
  codebook: Codebook,
  ontology: SignalOntology,
  log: import('@org/pipeline-core').JsonLogger,
): void {
  const unknown: string[] = [];
  const deprecated: string[] = [];

  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      const def = ontology.signals[ind.inputKey];
      if (!def) {
        unknown.push(`${dim.id}/${ind.id} → "${ind.inputKey}"`);
        continue;
      }
      if (def.deprecated_in != null) {
        deprecated.push(`${dim.id}/${ind.id} → "${ind.inputKey}" (deprecated_in v${def.deprecated_in})`);
      }
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `[score-hdri] Codebook references signals not in ontology v${ontology.version}:\n  ` +
      unknown.join('\n  '),
    );
  }

  if (deprecated.length > 0) {
    log.warn('deprecated-signals', `codebook references ${deprecated.length} deprecated signal(s)`, {
      deprecatedCount: deprecated.length,
      deprecatedSignals: deprecated,
    });
  }
}

/**
 * Aggregates observation rows into per-asset bundles: signals + per-signal
 * collection statuses + actual extractors. Signals and statuses populate the
 * scorer; actualExtractors feed the provenance cross-check.
 */
function buildAssetBundles(rows: ObsRow[]): Map<string, AssetSignalBundle> {
  const map = new Map<string, AssetSignalBundle>();

  for (const row of rows) {
    let bundle = map.get(row.asset_id);
    if (!bundle) {
      bundle = {
        signals: {} as Record<string, SignalValueType>,
        statuses: {} as Record<string, SignalCollectionStatus>,
        observationIds: [],
        actualExtractors: {},
      } as AssetSignalBundle;
      map.set(row.asset_id, bundle);
    }

    let value: SignalValueType = null;
    switch (row.value_type) {
      case 'bool':
        value = row.value_bool != null ? row.value_bool === 1 : null;
        break;
      case 'num':
        value = row.value_num;
        break;
      case 'str':
        value = row.value_str;
        break;
      case 'json':
        value = row.value_json;
        break;
    }

    (bundle.signals as Record<string, SignalValueType>)[row.signal_path] = value;
    bundle.observationIds.push(row.id);
    bundle.actualExtractors[row.signal_path] = row.extractor_version;

    if (row.collection_status && CONDITIONAL_STATUSES.has(row.collection_status as SignalCollectionStatus)) {
      (bundle.statuses as Record<string, SignalCollectionStatus>)[row.signal_path] = row.collection_status as SignalCollectionStatus;
    }
  }

  return map;
}

type SignalValueType = number | boolean | string | null;

/** Builds a lookup `${dimId}/${indId}` → Indicator for trace enrichment. */
function buildIndicatorIndex(codebook: Codebook): Map<string, Indicator> {
  const idx = new Map<string, Indicator>();
  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      idx.set(`${dim.id}/${ind.id}`, ind);
    }
  }
  return idx;
}
