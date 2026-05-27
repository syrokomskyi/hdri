/*
<MODULE_CONTRACT>
<purpose>Classifies business industry using HWO (Handwerksordnung) master dataset and Destatis mapping.</purpose>
<keywords>classification, hwo, handwerksordnung, destatis, mapping</keywords>
<responsibilities>
  <item>Fetches ALL unique site categories from the database for a given harvest batch.</item>
  <item>Classifies sites to exact HWO UIDs (A-25, B1-56, etc.) using primary classifier.</item>
  <item>Resolves Destatis groups (I-VII) from HWO UIDs via mapping system.</item>
  <item>Uses fallback heuristics for group-level classification when exact UID is unavailable.</item>
  <item>Stores HWO classification (uid, confidence, provenance) and normalized mapping results.</item>
  <item>Generates classification reports (JSON, Markdown, CSV) with HWO and Destatis distributions.</item>
</responsibilities>
<non-goals>
  <item>Does not perform LLM-based classification (rely on keyword mapping).</item>
  <item>Does not store Destatis group directly in sites table (uses normalized mappings table).</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ClassifyBrancheGogol">The main gogol class for HWO-based branche classification.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Migrate from GewerkGroup to HWO (Handwerksordnung) classification system.</item>
  <item>Replace classifyBrancheFromSignalsOrUnclassified with classifyToHwoUid primary classifier.</item>
  <item>Add resolveHwoMapping to derive Destatis groups from HWO UIDs.</item>
  <item>Add classifyToMappingTarget fallback for group-level classification without exact UID.</item>
  <item>Update database schema: store hwo_uid, hwo_confidence, hwo_provenance in sites table.</item>
  <item>Add site_hwo_mappings table for normalized Destatis group storage.</item>
  <item>Update reports to show HWO UID distribution and Destatis group (I-VII) distribution.</item>
  <item>Use single-line progress output via logProgress singleLine flag.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import {
  classifyToHwoUid,
  resolveHwoMapping,
  classifyToMappingTarget,
  getHwoMappingGroups,
  type HwoUid,
} from '@org/business-core/gewerk';
import { logProgress } from '@org/utils';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openCoreSqlite } from '../db/connection.js';

type HwoDistribution = Record<string, number>;
type DestatisDistribution = Record<string, number>;

const buildHwoDistribution = (uids: (HwoUid | null)[]): HwoDistribution => {
  const dist: HwoDistribution = { unclassified: 0 };
  for (const uid of uids) {
    if (uid) {
      dist[uid] = (dist[uid] ?? 0) + 1;
    } else {
      dist['unclassified'] = (dist['unclassified'] ?? 0) + 1;
    }
  }
  return dist;
};

const buildDestatisDistribution = (codes: (string | null)[]): DestatisDistribution => {
  const dist: DestatisDistribution = { unclassified: 0 };
  for (const code of codes) {
    if (code) {
      dist[code] = (dist[code] ?? 0) + 1;
    } else {
      dist['unclassified'] = (dist['unclassified'] ?? 0) + 1;
    }
  }
  return dist;
};

type SiteRow = {
  site_id: number;
  domain: string;
  categories: string | null;
  business_name: string | null;
};

type ClassificationResult = {
  uid: HwoUid | null;
  destatisCode: string | null;
  destatisLabel: string | null;
  confidence: number | null;
  provenance: string;
};

/**
 * Classifies every site in the batch using HWO (Handwerksordnung) dataset.
 * Primary classification targets exact HWO UIDs (A-25, B1-56, etc.).
 * Destatis groups (I-VII) are derived via mapping system.
 * Fallback heuristics provide group-level classification when exact UID unavailable.
 */
export class ClassifyBrancheGogol extends Gogol {
  override readonly id = 'classify-branche';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const db = openCoreSqlite(year);

    // Fetch ALL sites in this harvest batch with ALL their unique categories aggregated
    const sites = db
      .prepare<string[]>(`
      SELECT
        s.id as site_id,
        s.domain,
        GROUP_CONCAT(DISTINCT sss.category) as categories,
        (SELECT business_name FROM site_source_seeds
         WHERE site_id = s.id AND business_name IS NOT NULL
         LIMIT 1) as business_name
      FROM sites s
      LEFT JOIN site_source_seeds sss ON sss.site_id = s.id AND sss.category IS NOT NULL
      GROUP BY s.id
    `)
      .all() as SiteRow[];

    console.log(
      `[classify-branche] Classifying ${sites.length} sites`,
    );

    let classifiedWithUid = 0;
    let classifiedWithGroupOnly = 0;
    let unclassified = 0;

    const hwoUids: (HwoUid | null)[] = [];
    const destatisCodes: (string | null)[] = [];
    const logRows: string[][] = [['hwo_uid', 'destatis_code', 'destatis_label', 'categories', 'domain', 'business_name', 'provenance']];

    const updateSiteStmt = db.prepare<[string | null, number | null, string | null, number]>(
      `UPDATE sites SET hwo_uid = ?, hwo_confidence = ?, hwo_provenance = ? WHERE id = ?`,
    );

    const insertMappingStmt = db.prepare<[number, string, string, string | null, string]>(
      `INSERT OR REPLACE INTO site_hwo_mappings (site_id, mapping_system, target_code, target_label, source)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const progressInterval = Math.max(100, Math.floor(sites.length / 10));
    let processed = 0;

    db.transaction(() => {
      for (const site of sites) {
        processed++;
        const categoryList = site.categories
          ? site.categories.split(',').filter((c) => c.trim() !== '')
          : [];

        let result: ClassificationResult = {
          uid: null,
          destatisCode: null,
          destatisLabel: null,
          confidence: null,
          provenance: 'unclassified',
        };

        // Try primary classification to exact HWO UID
        if (categoryList.length > 0) {
          for (const category of categoryList) {
            const classification = classifyToHwoUid({
              rawBranche: category.trim(),
              siteTitle: site.business_name ?? undefined,
              companyName: site.business_name ?? undefined,
              domain: site.domain,
            });
            if (classification.uid) {
              const mapping = resolveHwoMapping(classification.uid, 'destatis_group');
              result = {
                uid: classification.uid,
                destatisCode: mapping?.code ?? null,
                destatisLabel: mapping?.label ?? null,
                confidence: classification.confidence,
                provenance: classification.provenance,
              };
              break;
            }
          }
        }

        // If no category yielded a match, try with domain/business_name only
        if (!result.uid) {
          const classification = classifyToHwoUid({
            rawBranche: undefined,
            siteTitle: site.business_name ?? undefined,
            companyName: site.business_name ?? undefined,
            domain: site.domain,
          });
          if (classification.uid) {
            const mapping = resolveHwoMapping(classification.uid, 'destatis_group');
            result = {
              uid: classification.uid,
              destatisCode: mapping?.code ?? null,
              destatisLabel: mapping?.label ?? null,
              confidence: classification.confidence,
              provenance: classification.provenance,
            };
          }
        }

        // Fallback: use heuristic group-level classification
        if (!result.uid && !result.destatisCode) {
          const fallback = classifyToMappingTarget({
            rawBranche: categoryList[0] ?? undefined,
            siteTitle: site.business_name ?? undefined,
            companyName: site.business_name ?? undefined,
            domain: site.domain,
          }, 'destatis_group');

          if (fallback) {
            result = {
              uid: null,
              destatisCode: fallback.code,
              destatisLabel: fallback.label,
              confidence: fallback.confidence,
              provenance: fallback.provenance,
            };
          }
        }

        hwoUids.push(result.uid);
        destatisCodes.push(result.destatisCode);

        logRows.push([
          result.uid ?? '',
          result.destatisCode ?? '',
          result.destatisLabel ?? '',
          categoryList.join(' | ') || '',
          site.domain,
          site.business_name ?? '',
          result.provenance,
        ]);

        updateSiteStmt.run(
          result.uid,
          result.confidence,
          result.provenance,
          site.site_id,
        );

        // Store mapping result in normalized table
        if (result.destatisCode) {
          insertMappingStmt.run(
            site.site_id,
            'destatis_group',
            result.destatisCode,
            result.destatisLabel,
            result.uid ? 'from_hwo_uid' : result.provenance,
          );
        }

        logProgress(this.id, processed, sites.length, progressInterval, true);

        if (result.uid) {
          classifiedWithUid++;
        } else if (result.destatisCode) {
          classifiedWithGroupOnly++;
        } else {
          unclassified++;
        }
      }
    })();

    db.close();

    const hwoDistribution = buildHwoDistribution(hwoUids);
    const destatisDistribution = buildDestatisDistribution(destatisCodes);
    const outDir = ctx.getGogolOutputDir(this.id);

    const report = {
      totalSites: sites.length,
      classifiedWithUid,
      classifiedWithGroupOnly,
      unclassified,
      hwoDistribution,
      destatisDistribution,
    };

    console.log(
      `[classify-branche] Done. total=${sites.length}, with_uid=${classifiedWithUid}, group_only=${classifiedWithGroupOnly}, unclassified=${unclassified}`,
    );

    await ctx.writeTextFile(
      path.join(outDir, 'classify-report.json'),
      JSON.stringify(report, null, 2),
    );

    await ctx.writeTextFile(path.join(outDir, 'classifications.csv'), csvStringify(logRows));

    // Build Destatis distribution table
    const destatisGroups = getHwoMappingGroups('destatis_group') ?? [];
    const destatisRows = destatisGroups
      .map((g) => [g.label, g.code, String(destatisDistribution[g.code] ?? 0)]);
    destatisRows.push(['Unclassified', '-', String(destatisDistribution['unclassified'] ?? 0)]);

    const md: string[] = [
      `# Branche Classification Report (HWO)`,
      ``,
      `**Harvest batch ID:** harvest`,
      ``,
      markdownTable(
        [['Metric', 'Value'], ['Total sites', String(sites.length)], ['With HWO UID', String(classifiedWithUid)], ['Group only', String(classifiedWithGroupOnly)], ['Unclassified', String(unclassified)]],
        { align: ['l', 'r'] }
      ),
      ``,
      `> **Group only**: sites classified by fallback heuristics to a Destatis group (I–VII) without matching an exact HWO UID.`,
      ``,
      `## Destatis Group Distribution (I-VII)`,
      ``,
      markdownTable(
        [['Group', 'Code', 'Count'], ...destatisRows],
        { align: ['l', 'l', 'r'] }
      ),
    ];

    await ctx.writeTextFile(path.join(outDir, 'classify-report.md'), md.join('\n'));
  }
}
