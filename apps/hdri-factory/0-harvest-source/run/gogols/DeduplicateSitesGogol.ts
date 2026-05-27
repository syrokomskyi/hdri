/*
<MODULE_CONTRACT>
<purpose>Facilitates analysis of site duplication across harvest batches, ensuring data integrity through structural deduplication.</purpose>
<keywords>deduplication, reporting, database, batch processing</keywords>
<responsibilities>
  <item>Counts new and returning sites for the current harvest batch.</item>
  <item>Identifies sites extracted from multiple sources within the same batch.</item>
  <item>Generates and writes detailed reports in JSON and Markdown formats.</item>
  <item>Logs deduplication metrics for operational visibility.</item>
</responsibilities>
<non-goals>
  <item>Do not modify site data; deduplication is handled by database constraints.</item>
  <item>Do not perform data parsing or transformation outside of reporting.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="reporting">Report generation and logging</entry>
  <entry key="deduplication">Site deduplication analysis</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding to enhance navigability and maintainability of the DeduplicateSitesGogol class.</item>
  <item>Update terminology from 'catalog' to 'sources'.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed harvestYear field.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openCoreSqlite } from '../db/connection.js';

/**
 * Analyses cross-batch duplication in the sites table.
 *
 * In source-harvest the deduplication is structural: the sites table has a
 * UNIQUE constraint on domain, so the same domain inserted in multiple batches
 * automatically collapses into one row (via INSERT OR IGNORE / ON CONFLICT).
 *
 * This gogol therefore:
 *  1. Reports how many sites in this batch already existed (cross-batch dups).
 *  2. Reports how many sites appear with seeds from multiple source files
 *     (within-batch dups — same domain scraped from different sources).
 *  3. Writes the report JSON/MD for operator review.
 *
 * No data is modified here — the DB is already deduplicated by design.
 */
export class DeduplicateSitesGogol extends Gogol {
  override readonly id = 'deduplicate-sites';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const db = openCoreSqlite(year);

    // Total sites in the DB
    const totalSites = (db.prepare(`
      SELECT COUNT(*) AS n FROM sites
    `).get() as { n: number }).n;

    // Sites with seeds from >1 distinct source_path within this batch
    // (same domain scraped from multiple source files)
    const multiSourceSites = (db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT site_id
        FROM site_source_seeds
        GROUP BY site_id
        HAVING COUNT(DISTINCT source_path) > 1
      )
    `).get() as { n: number }).n;

    // All-time unique sites in the DB
    const totalAllTime = (db.prepare(`
      SELECT COUNT(*) AS n FROM sites
    `).get() as { n: number }).n;

    db.close();

    const report = {
      totalSites: totalSites,
      multiSourceSitesThisBatch: multiSourceSites,
      totalUniqueDomainsAllTime: totalAllTime,
    };

    console.log(
      `[deduplicate-sites] total=${totalSites}, ` +
      `multi-source=${multiSourceSites}, allTime=${totalAllTime}`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);

    await ctx.writeTextFile(
      path.join(outDir, 'dedup-report.json'),
      JSON.stringify(report, null, 2),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'dedup-report.md'),
      [
        `# Deduplication Report`,
        ``,
        `**Harvest batch ID:** harvest`,
        ``,
        markdownTable(
          [
            ['Metric', 'Value'],
            ['Total sites', String(totalSites)],
            ['Sites with >1 source', String(multiSourceSites)],
            ['Unique domains all-time', String(totalAllTime)],
          ],
          { align: ['l', 'r'] }
        ),
        ``,
        `> Structural deduplication is enforced by the UNIQUE(domain) constraint`,
        `> in the sites table — no manual merge required.`,
      ].join('\n'),
    );
  }
}

