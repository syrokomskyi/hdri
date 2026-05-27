/*
<MODULE_CONTRACT>
<purpose>Exports privacy-safe analytical mart files (CSV and JSON) from scored observations.</purpose>
<keywords>export, mart, csv, k-anonymity, privacy, hwo, destatis</keywords>
<responsibilities>
  <item>Reads scores, asset_states, asset_hwo_mappings, and cohort_aggregates from observatory.db.</item>
  <item>Reads Destatis group (I-VII) from asset_hwo_mappings for stratification.</item>
  <item>Applies k-anonymity filtering (min group size 5) for public mode.</item>
  <item>Writes CSV and JSON mart files to .output/mart/.</item>
  <item>Writes mart-manifest.json artifact.</item>
</responsibilities>
<non-goals>
  <item>Do not compute scores or aggregates.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ExportMartGogol">Gogol class for mart export.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
  <item>Update to use HWO Destatis groups (strata_code) instead of gewerk_group.</item>
  <item>Join with asset_hwo_mappings for Destatis group classification.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @org/pipeline-core.</item>
  <item>Join mart exports against asset states and mappings from the same run for quarter-correct archive output.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { parsePeriod } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { Gogol } from '../pipeline/Gogol';
import type { PipelineContext } from '../pipeline/types';
import { openObservatoryDb } from '../db/connection';
import { outputRootDir } from '../config';

const K_ANONYMITY_MIN = 5;

type ScoredAssetRow = {
  asset_id: string;
  domain: string;
  strata_code: string | null;
  destatis_label: string | null;
  bundesland: string | null;
  overall_score: number | null;
  confidence: number;
  codebook_version: string;
};

type AggRow = {
  axis: string | null;
  axis_value: string | null;
  stat_type: string;
  dimension_id: string | null;
  n: number;
  mean: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  min_val: number | null;
  max_val: number | null;
};

type RemediationRow = {
  asset_id: string;
  domain: string;
  dimension_id: string;
  indicator_id: string;
  input_key: string;
  score: number | null;
  severity: string;
  category: string;
  human_label: string;
  recommendation: string;
};

const REMEDIATION_THRESHOLD = 60;

export class ExportMartGogol extends Gogol {
  override readonly id = 'export-mart';

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error('Missing run_id');
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const runId = ctx.state.runId!;
    const publicMode = ctx.state.brief.publicMode ?? false;
    const martDir = path.join(outputRootDir, 'mart');
    await fs.mkdir(martDir, { recursive: true });
    const log = createJsonLogger({ app: 'digital-observatory', pipeline: 'observatory' })
      .withContext({ gogol: this.id });

    const year = parsePeriod(ctx.state.brief.period).year;
    const db = openObservatoryDb(year);
    const files: { name: string; rows: number; filtered: number }[] = [];

    try {
      // 1. Site scores CSV
      const scoredAssets = db.prepare(`
        SELECT
          s.asset_id, a.domain, m.target_code as strata_code, m.target_label as destatis_label, a.bundesland,
          s.overall_score, s.confidence, s.codebook_version
        FROM scores s
        JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
        LEFT JOIN asset_hwo_mappings m ON m.asset_id = s.asset_id AND m.mapping_system = 'destatis_group' AND m.run_id = s.run_id
        WHERE s.run_id = ?
        ORDER BY s.overall_score DESC
      `).all(runId) as ScoredAssetRow[];

      let siteRows = scoredAssets;
      let filteredSites = 0;

      if (publicMode) {
        // k-anonymity: filter out groups smaller than K_ANONYMITY_MIN
        const groupCounts = new Map<string, number>();
        for (const row of scoredAssets) {
          const key = `${row.strata_code ?? 'null'}|${row.bundesland ?? 'null'}`;
          groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
        }
        siteRows = scoredAssets.filter((row) => {
          const key = `${row.strata_code ?? 'null'}|${row.bundesland ?? 'null'}`;
          return (groupCounts.get(key) ?? 0) >= K_ANONYMITY_MIN;
        });
        filteredSites = scoredAssets.length - siteRows.length;
      }

      const sitesCsvPath = path.join(martDir, 'site-scores.csv');
      const sitesOutput = stringify(siteRows, {
        header: true,
        columns: [
          { key: 'asset_id' }, { key: 'domain' },
          { key: 'strata_code', header: 'destatis_group' },
          { key: 'destatis_label' }, { key: 'bundesland' },
          { key: 'overall_score' }, { key: 'confidence' }, { key: 'codebook_version' },
        ],
      });
      await fs.writeFile(sitesCsvPath, sitesOutput, 'utf-8');
      files.push({ name: 'site-scores.csv', rows: siteRows.length, filtered: filteredSites });

      // 2. Remediation report — actionable guidance for low-scoring indicators
      const remediationRows = db.prepare(`
        SELECT
          s.asset_id,
          a.domain,
          t.dimension_id,
          t.indicator_id,
          t.input_key,
          t.score,
          t.remediation_json
        FROM score_indicator_traces t
        JOIN scores s ON s.id = t.score_id
        JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
        WHERE s.run_id = ?
          AND t.remediation_json IS NOT NULL
          AND (t.score IS NULL OR t.score < ?)
        ORDER BY t.dimension_id, t.indicator_id, s.asset_id
      `).all(runId, REMEDIATION_THRESHOLD) as Array<{
        asset_id: string;
        domain: string;
        dimension_id: string;
        indicator_id: string;
        input_key: string;
        score: number | null;
        remediation_json: string;
      }>;

      const parsedRemediation: RemediationRow[] = [];
      for (const r of remediationRows) {
        try {
          const rem = JSON.parse(r.remediation_json) as {
            severity: string; category: string; humanLabel: string; recommendation: string;
          };
          parsedRemediation.push({
            asset_id: r.asset_id,
            domain: r.domain,
            dimension_id: r.dimension_id,
            indicator_id: r.indicator_id,
            input_key: r.input_key,
            score: r.score,
            severity: rem.severity,
            category: rem.category,
            human_label: rem.humanLabel,
            recommendation: rem.recommendation,
          });
        } catch {
          log.warn('remediation-skip', `Skipping remediation row: invalid remediation_json for ${r.asset_id}/${r.indicator_id}`, {
          assetId: r.asset_id,
          indicatorId: r.indicator_id,
        });
        }
      }

      const remediationCsvPath = path.join(martDir, 'remediation-report.csv');
      const remediationCsv = stringify(parsedRemediation, { header: true });
      await fs.writeFile(remediationCsvPath, remediationCsv, 'utf-8');
      files.push({ name: 'remediation-report.csv', rows: parsedRemediation.length, filtered: 0 });

      // 3. Cohort aggregates JSON
      const cohortId = ctx.state.cohortId;
      if (cohortId) {
        const aggRows = db.prepare(`
          SELECT axis, axis_value, stat_type, dimension_id, n, mean, p10, p25, p50, p75, p90, min_val, max_val
          FROM cohort_aggregates
          WHERE cohort_id = ?
        `).all(cohortId) as AggRow[];

        let filteredAggs = 0;
        let aggOutput = aggRows;

        if (publicMode) {
          aggOutput = aggRows.filter((r) => r.n >= K_ANONYMITY_MIN);
          filteredAggs = aggRows.length - aggOutput.length;
        }

        const aggsPath = path.join(martDir, 'cohort-aggregates.json');
        await fs.writeFile(aggsPath, JSON.stringify(aggOutput, null, 2), 'utf-8');
        files.push({ name: 'cohort-aggregates.json', rows: aggOutput.length, filtered: filteredAggs });
      }
    } finally {
      db.close();
    }

    // Write manifest
    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'mart-manifest.json'),
      JSON.stringify({
        mart_dir: martDir,
        public_mode: publicMode,
        k_anonymity_min: K_ANONYMITY_MIN,
        files,
        run_id: runId,
      }, null, 2),
    );

    log.info('export-finished', `Done. ${files.length} files written to ${martDir}.`, {
      fileCount: files.length,
      martDir,
    });
  }
}
