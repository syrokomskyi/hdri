/*
<MODULE_CONTRACT>
<purpose>Pure, reusable HDRI scoring core: read a run's observations, build per-asset
signal bundles, score via the codebook, and write scores/dimensions/traces — with the
exact computation_hash semantics used in production. Shared by ScoreHdriGogol (the live
pipeline) and the rebuild-from-vault round-trip (WP7), so both score through one code path.</purpose>
<non-goals>
  <item>Does not load the codebook/ontology or cross-validate — the caller does that.</item>
  <item>Does not aggregate into cohorts — that is build-cohorts.</item>
  <item>Does not open/close the DB — the caller owns the connection lifecycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP7: extracted from ScoreHdriGogol so rebuild-from-vault re-scores through the identical path.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import type Database from "better-sqlite3";
import { scoreSite } from "@syrokomskyi/hdri-codebook";
import type {
  Codebook,
  Indicator,
  SiteSignals,
  SiteSignalStatuses,
} from "@syrokomskyi/hdri-codebook";
import { computationHash, newId } from "@syrokomskyi/observatory-core";
import type { SignalCollectionStatus } from "@syrokomskyi/observatory-core";

/** Observation row shape consumed by the scorer (a projection of the observations table). */
export type ScoreObsRow = {
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

type SignalValueType = number | boolean | string | null;

/** Per-asset payload assembled from observations. */
export type AssetSignalBundle = {
  signals: SiteSignals;
  statuses: SiteSignalStatuses;
  /** Observation IDs that contributed to this asset's signals (drives computation_hash). */
  observationIds: string[];
  /** signal_path → probe_version observed (informational provenance). */
  actualExtractors: Record<string, string | null>;
};

/** Per-asset result captured for assertions / reporting (round-trip identity check). */
export type AssetScore = {
  overallScore: number;
  confidence: number;
  computationHash: string;
};

export type ScoringSummary = {
  scored: number;
  skipped: number;
  total: number;
  /** asset_id → {overallScore, confidence, computationHash} for every scored asset. */
  perAsset: Map<string, AssetScore>;
};

export type ScoreRunOptions = {
  runId: string;
  period: string;
  /** Single scored_at timestamp for the whole run. */
  now: string;
  onProgress?: (processed: number, total: number) => void;
};

const CONDITIONAL_STATUSES = new Set<SignalCollectionStatus>([
  "absent",
  "unreachable",
  "forbidden",
  "not_applicable",
]);

/**
 * Selects active observations for a run. observations.run_id is the OBSERVATORY runId;
 * bundle-synced observations also carry factory_run_id, joined via synced_bundles. The OR
 * covers both legacy (run_id) and bundle (factory_run_id) ingestion paths — identical to the
 * live ScoreHdriGogol query so rebuilds re-score over the exact same row set.
 */
export function readObsRowsForRun(db: Database.Database, runId: string): ScoreObsRow[] {
  return db
    .prepare(
      `
      SELECT id, asset_id, signal_path, value_bool, value_num, value_str, value_json,
             value_type, collection_status, extractor_version
      FROM observations
      WHERE status = 'active'
        AND (
          run_id = ?
          OR factory_run_id IN (SELECT run_id FROM synced_bundles WHERE observatory_run_id = ?)
        )
      ORDER BY asset_id
    `,
    )
    .all(runId, runId) as ScoreObsRow[];
}

/**
 * Aggregates observation rows into per-asset bundles: signals + per-signal collection
 * statuses + actual extractors + contributing observation ids.
 */
export function buildAssetBundles(rows: ScoreObsRow[]): Map<string, AssetSignalBundle> {
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
      case "bool":
        value = row.value_bool != null ? row.value_bool === 1 : null;
        break;
      case "num":
        value = row.value_num;
        break;
      case "str":
        value = row.value_str;
        break;
      case "json":
        value = row.value_json;
        break;
    }

    (bundle.signals as Record<string, SignalValueType>)[row.signal_path] = value;
    bundle.observationIds.push(row.id);
    bundle.actualExtractors[row.signal_path] = row.extractor_version;

    if (
      row.collection_status &&
      CONDITIONAL_STATUSES.has(row.collection_status as SignalCollectionStatus)
    ) {
      (bundle.statuses as Record<string, SignalCollectionStatus>)[row.signal_path] =
        row.collection_status as SignalCollectionStatus;
    }
  }

  return map;
}

/** Builds a lookup `${dimId}/${indId}` → Indicator for trace enrichment. */
export function buildIndicatorIndex(codebook: Codebook): Map<string, Indicator> {
  const idx = new Map<string, Indicator>();
  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      idx.set(`${dim.id}/${ind.id}`, ind);
    }
  }
  return idx;
}

/**
 * Reads a run's observations, scores each asset against the codebook, and writes
 * scores/dimensions/traces. Idempotent: clears any prior scores (and dependent dimension
 * and trace rows) for the run before inserting, so re-running rebuilds rather than
 * double-counts. Returns the per-asset {overallScore, computationHash} so callers can
 * assert reproducibility (DB → vault → fresh DB → identical computation_hash).
 */
export function scoreAndWriteForRun(
  db: Database.Database,
  codebook: Codebook,
  opts: ScoreRunOptions,
): ScoringSummary {
  const rows = readObsRowsForRun(db, opts.runId);
  const assetBundles = buildAssetBundles(rows);
  const indicatorIndex = buildIndicatorIndex(codebook);
  const perAsset = new Map<string, AssetScore>();

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

  const clearPriorTraces = db.prepare(
    `DELETE FROM score_indicator_traces WHERE score_id IN (SELECT id FROM scores WHERE run_id = ?)`,
  );
  const clearPriorDims = db.prepare(
    `DELETE FROM score_dimensions WHERE score_id IN (SELECT id FROM scores WHERE run_id = ?)`,
  );
  const clearPriorScores = db.prepare(`DELETE FROM scores WHERE run_id = ?`);

  let scored = 0;
  let skipped = 0;

  const scoreBatch = db.transaction(() => {
    clearPriorTraces.run(opts.runId);
    clearPriorDims.run(opts.runId);
    clearPriorScores.run(opts.runId);

    let processed = 0;
    for (const [assetId, bundle] of assetBundles) {
      const result = scoreSite(bundle.signals, codebook, { signalStatuses: bundle.statuses });

      if (result.overallScore === null) {
        skipped += 1;
        processed += 1;
        opts.onProgress?.(processed, assetBundles.size);
        continue;
      }

      const scoreId = newId();
      const compHash = computationHash(codebook.version, bundle.observationIds);

      insertScore.run(
        scoreId,
        assetId,
        codebook.id,
        codebook.version,
        result.overallScore,
        result.confidence,
        compHash,
        opts.runId,
        opts.now,
        opts.period,
      );

      for (const dim of result.dimensions) {
        insertDim.run(scoreId, dim.dimensionId, dim.score, dim.confidence, dim.effectiveWeight);
      }

      for (const trace of result.trace) {
        const ind = indicatorIndex.get(`${trace.dimensionId}/${trace.indicatorId}`);
        const remediationJson = ind?.remediation ? JSON.stringify(ind.remediation) : null;
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

      perAsset.set(assetId, {
        overallScore: result.overallScore,
        confidence: result.confidence,
        computationHash: compHash,
      });
      scored += 1;
      processed += 1;
      opts.onProgress?.(processed, assetBundles.size);
    }
  });

  scoreBatch();

  return { scored, skipped, total: assetBundles.size, perAsset };
}
