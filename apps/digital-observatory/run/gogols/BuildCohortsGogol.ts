/*
<MODULE_CONTRACT>
<purpose>Assigns scored assets to a cohort, stratifies, and computes aggregate statistics.</purpose>
<keywords>cohort, stratification, aggregation, statistics, hwo, destatis</keywords>
<responsibilities>
  <item>Creates a cohort record for this run.</item>
  <item>Reads asset_hwo_mappings for Destatis group classification (I-VII).</item>
  <item>Assigns all scored assets as cohort members with strata_system/strata_code/bundesland.</item>
  <item>Calls aggregateCohort() for overall + per-axis breakdowns.</item>
  <item>Writes cohort_aggregates rows and cohort-summary.json artifact.</item>
</responsibilities>
<non-goals>
  <item>Do not score — that is done by score-hdri.</item>
  <item>Do not export — that is done by export-mart.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="BuildCohortsGogol">Gogol class for cohort building.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>Update to use HWO mappings: read from asset_hwo_mappings for Destatis groups.</item>
  <item>Use strata_system/strata_code instead of gewerk_group.</item>
  <item>Update stratum keys for aggregation.</item>
  <item>Add gewerk_group-based cohort grouping while retaining Destatis strata membership.</item>
  <item>Replace raw console.log with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Read asset states from the current run so historical quarter rebuilds do not depend on valid_to IS NULL.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { aggregateCohort, type ScoredSite } from '@org/hdri-codebook';
import { newId, parsePeriod } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';

type ScoreRow = {
  id: string;
  asset_id: string;
  codebook_id: string;
  codebook_version: string;
  overall_score: number | null;
  confidence: number;
};

type DimRow = {
  score_id: string;
  dimension_id: string;
  score: number | null;
  confidence: number;
  effective_weight: number;
};

type AssetRow = {
  asset_id: string;
  domain: string;
  gewerk_group: string | null;
  hwo_uid: string | null;
  hwo_provenance: string | null;
  bundesland: string | null;
};

type MappingRow = {
  asset_id: string;
  target_code: string;
  target_label: string | null;
};

export class BuildCohortsGogol extends Gogol {
  override readonly id = 'build-cohorts';

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error('Missing run_id — setup-observatory-run must run first');
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const runId = ctx.state.runId!;
    const now = new Date().toISOString();
    const cohortId = newId();
    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    const year = parsePeriod(ctx.state.brief.period).year;
    const db = openObservatoryDb(year);

    try {
      // Read scores for this run
      const scoreRows = db.prepare(`
        SELECT id, asset_id, codebook_id, codebook_version, overall_score, confidence
        FROM scores WHERE run_id = ?
      `).all(runId) as ScoreRow[];

      if (scoreRows.length === 0) {
        log.info('no-scores', 'No scores found — skipping cohort.');
        return;
      }

      const codebookVersion = scoreRows[0]!.codebook_version;

      // Read dimension scores
      const dimRows = db.prepare(`
        SELECT sd.score_id, sd.dimension_id, sd.score, sd.confidence, sd.effective_weight
        FROM score_dimensions sd
        JOIN scores s ON s.id = sd.score_id
        WHERE s.run_id = ?
      `).all(runId) as DimRow[];

      const dimByScore = new Map<string, DimRow[]>();
      for (const d of dimRows) {
        const arr = dimByScore.get(d.score_id);
        if (arr) arr.push(d);
        else dimByScore.set(d.score_id, [d]);
      }

      // Read asset states
      const assetRows = db.prepare(`
        SELECT asset_id, domain, gewerk_group, hwo_uid, hwo_provenance, bundesland
        FROM asset_states WHERE run_id = ?
      `).all(runId) as AssetRow[];

      const assetMap = new Map<string, AssetRow>();
      for (const a of assetRows) {
        assetMap.set(a.asset_id, a);
      }

      // Read HWO mappings for Destatis groups
      const mappingRows = db.prepare(`
        SELECT asset_id, target_code, target_label
        FROM asset_hwo_mappings WHERE run_id = ? AND mapping_system = 'destatis_group'
      `).all(runId) as MappingRow[];

      const mappingMap = new Map<string, MappingRow>();
      for (const m of mappingRows) {
        mappingMap.set(m.asset_id, m);
      }

      // Collect dimension IDs
      const dimensionIds = [...new Set(dimRows.map((d) => d.dimension_id))].sort();

      // Build ScoredSite array
      const scoredSites: ScoredSite[] = scoreRows.map((s) => {
        const dims = dimByScore.get(s.id) ?? [];
        const asset = assetMap.get(s.asset_id);
        const mapping = mappingMap.get(s.asset_id);

        return {
          siteId: s.asset_id,
          stratum: {
            siteId: s.asset_id,
            strataSystem: 'destatis_group',
            strataCode: mapping?.target_code ?? 'unknown',
            gewerkGroup: asset?.gewerk_group ?? 'unknown',
            destatisGroup: mapping?.target_code ?? 'unknown',
            bundesland: asset?.bundesland ?? 'unknown',
          },
          score: {
            overallScore: s.overall_score,
            confidence: s.confidence,
            dimensions: dims.map((d) => ({
              dimensionId: d.dimension_id,
              score: d.score,
              confidence: d.confidence,
              effectiveWeight: d.effective_weight,
            })),
            trace: [],
            codebookVersion,
            codebookId: s.codebook_id,
          },
        };
      });

      // Aggregate
      const report = aggregateCohort(
        scoredSites,
        dimensionIds,
        ['strataCode', 'gewerkGroup', 'bundesland'],
      );

      // Write cohort + members + aggregates
      const writeCohort = db.transaction(() => {
        db.prepare(`
          INSERT INTO cohorts (id, description, codebook_version, run_id, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(cohortId, `Run ${runId} cohort`, codebookVersion, runId, now);

        const insertMember = db.prepare(`
          INSERT OR IGNORE INTO cohort_members (cohort_id, asset_id, strata_system, strata_code, gewerk_group, bundesland)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const s of scoredSites) {
          const asset = assetMap.get(s.siteId as string);
          const mapping = mappingMap.get(s.siteId as string);
          insertMember.run(
            cohortId,
            s.siteId,
            'destatis_group',
            mapping?.target_code ?? 'unknown',
            asset?.gewerk_group ?? null,
            asset?.bundesland ?? null,
          );
        }

        // Write aggregates
        const insertAgg = db.prepare(`
          INSERT INTO cohort_aggregates
            (cohort_id, axis, axis_value, stat_type, dimension_id, n, mean, p10, p25, p50, p75, p90, min_val, max_val)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Overall aggregate
        writeAggregate(insertAgg, cohortId, null, null, 'overall', null, report.cohort.overall);
        for (const [dimId, summary] of Object.entries(report.cohort.perDimension)) {
          writeAggregate(insertAgg, cohortId, null, null, 'dimension', dimId, summary);
        }

        // Per-axis aggregates
        for (const [axis, slices] of Object.entries(report.byAxis)) {
          for (const slice of slices) {
            const axisValue = slice.group ? String(Object.values(slice.group)[0]) : null;
            writeAggregate(insertAgg, cohortId, axis, axisValue, 'overall', null, slice.overall);
            for (const [dimId, summary] of Object.entries(slice.perDimension)) {
              writeAggregate(insertAgg, cohortId, axis, axisValue, 'dimension', dimId, summary);
            }
          }
        }
      });

      writeCohort();

      ctx.state.cohortId = cohortId;

      const outDir = ctx.getGogolOutputDir(this.id);
      await ctx.writeTextFile(
        path.join(outDir, 'cohort-summary.json'),
        JSON.stringify({
          cohort_id: cohortId,
          member_count: scoredSites.length,
          dimension_ids: dimensionIds,
          overall: report.cohort.overall,
          axes: Object.keys(report.byAxis),
          run_id: runId,
        }, null, 2),
      );

      log.info('cohort-finished', `Done. Cohort ${cohortId}: ${scoredSites.length} members, ${dimensionIds.length} dimensions.`, {
        cohortId,
        memberCount: scoredSites.length,
        dimensionCount: dimensionIds.length,
      });
    } finally {
      db.close();
    }
  }
}

type ScoreSummaryOrNull = { n: number; mean: number; p10: number; p25: number; p50: number; p75: number; p90: number; min: number; max: number } | null;

function writeAggregate(
  stmt: import('better-sqlite3').Statement,
  cohortId: string,
  axis: string | null,
  axisValue: string | null,
  statType: string,
  dimensionId: string | null,
  summary: ScoreSummaryOrNull,
): void {
  if (!summary) return;
  stmt.run(
    cohortId,
    axis,
    axisValue,
    statType,
    dimensionId,
    summary.n,
    summary.mean,
    summary.p10,
    summary.p25,
    summary.p50,
    summary.p75,
    summary.p90,
    summary.min,
    summary.max,
  );
}
