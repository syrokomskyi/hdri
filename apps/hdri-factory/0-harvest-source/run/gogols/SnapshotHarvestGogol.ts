/*
<MODULE_CONTRACT>
<purpose>Final step in the harvest pipeline, preparing core.db for downstream processing.</purpose>
<keywords>harvest, provenance, database, statistics, geographic</keywords>
<responsibilities>
  <item>Compute SHA-256 hash of core.db for provenance tracking.</item>
  <item>Record pipeline inputs in core.db for downstream consumption.</item>
  <item>Generate and export a summary JSON and Markdown report with key statistics.</item>
</responsibilities>
<non-goals>
  <item>Do not perform raw data parsing or transformation here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="totalSites">Count of unique sites in the database.</entry>
  <entry key="totalSeeds">Count of seeds for the current harvest batch.</entry>
  <entry key="gewerkDistribution">Distribution of sites across all Destatis groups (I–VII) including unclassified.</entry>
  <entry key="stateDistribution">Distribution of unique sites by German state (Bundesland).</entry>
  <entry key="stateGroupDistribution">Distribution of unique sites by state and Destatis group.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding to enhance navigability and maintainability.</item>
  <item>Remove 'Sites with GewerkGroup' metric; all sites now classified.</item>
  <item>Add 'unclassified' entry at end of GewerkGroup distribution list.</item>
  <item>Add geographic distribution reports by state from zipcodes data.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Fix geographic distribution: use authoritative sites.bundesland instead of joining site_source_seeds to avoid double-counting sites with multiple postal codes.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed harvestYear field.</item>
  <item>Sort 'unclassified' to the end of group columns in 2D distribution tables (SENTINEL_LAST), matching EnrichBundeslandGogol.</item>
  <item>Normalise coreDbPath to relative in harvest-snapshot.json and harvest-snapshot.md artifacts using toFactoryRelativePath so paths are relative to apps/hdri-factory.</item>
  <item>Remove obsolete sites.gewerk_group references; derive group from site_hwo_mappings (destatis_group) for distribution reports.</item>
  <item>Sort Destatis groups by Roman numeral order (I–VII) in distribution tables and 2D state-group columns.</item>
  <item>Fix zipcodes.de.json path resolution: change brief.md path from ../../.input to ../.input to correctly resolve from app .input directory.</item>
  <item>Make loadGeoIndex fail with thrown error instead of returning null when zipcodes file cannot be loaded.</item>
  <item>Fix zipcodes path resolution in SnapshotHarvestGogol: use briefInputDir instead of ctx.inputDir + '..' to align with EnrichBundeslandGogol.</item>
  <item>Read zipcodesTablePath from rootBrief (factory-level) and fail fast if missing or file unreadable.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { toFactoryRelativePath } from '../config.js';
import { hashDatabaseFile } from '@org/business-core/cross-db';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openCoreSqlite } from '../db/connection.js';
import { getCoreDbPath } from '../paths.js';
import { inputDir } from '../config.js';
import { CORE_SCHEMA_VERSION, OWNER_APP } from '../constants.js';

/** Entry in the zipcodes JSON file */
type ZipcodeEntry = {
  country_code: string;
  zipcode: string;
  place: string;
  state: string;
  state_code: string;
  province: string;
  province_code: string;
  latitude: string;
  longitude: string;
};

/** Geographic lookup index for fast postal code resolution */
type GeoIndex = {
  /** postal code -> state (Bundesland) */
  postalToState: Map<string, string>;
};

/**
 * SnapshotHarvestGogol — final gogol in the harvest pipeline.
 *
 * Responsibilities:
 *  1. Compute SHA-256 of core.db for provenance tracking.
 *  2. Write pipeline_inputs record to core.db (consumed by hdri-scoring).
 *  3. Export a harvest-summary JSON with key stats for the operator.
 *  4. Generate geographic distribution reports from zipcodes data.
 *
 * After this gogol completes, core.db is ready for downstream pipelines
 * (site-liveness, site-profile, hdri-scoring) to ATTACH via attachDatabase().
 */
export class SnapshotHarvestGogol extends Gogol {
  override readonly id = 'snapshot-harvest';

  /**
   * Load and index zipcodes data for fast postal code lookups.
   * Throws if zipcodesTablePath is missing in root brief or file cannot be read.
   */
  private async loadGeoIndex(ctx: PipelineContext): Promise<GeoIndex> {
    const zipcodesPath = ctx.state.rootBrief.zipcodesTablePath;
    if (!zipcodesPath) {
      throw new Error('[snapshot-harvest] zipcodesTablePath is missing in root brief.md — required for geographic reports');
    }

    const fullPath = path.isAbsolute(zipcodesPath)
      ? zipcodesPath
      : path.join(inputDir, zipcodesPath);

    console.log(`[snapshot-harvest] Loading zipcodes from ${zipcodesPath}...`);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const entries: ZipcodeEntry[] = JSON.parse(content);

      const postalToState = new Map<string, string>();

      for (const entry of entries) {
        const zip = entry.zipcode?.trim();
        if (!zip) continue;

        if (!postalToState.has(zip) && entry.state) {
          postalToState.set(zip, entry.state.trim());
        }
      }

      console.log(
        `[snapshot-harvest] Indexed ${postalToState.size} postal codes to states`,
      );

      return { postalToState };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(
        `[snapshot-harvest] Failed to load zipcodes data from ${fullPath}: ${err.message}`, { cause: error },
      );
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const coreDbPath = getCoreDbPath(year);

    // Load geographic index for reports
    const geoIndex = await this.loadGeoIndex(ctx);

    console.log(`[snapshot-harvest] Computing SHA-256 of ${path.basename(coreDbPath)}...`);
    const sha256 = await hashDatabaseFile(coreDbPath);
    console.log(`[snapshot-harvest] sha256=${sha256}`);

    // Write pipeline_inputs provenance record
    const db = openCoreSqlite(year);

    // Gather harvest summary stats
    const totalSites = (db.prepare('SELECT COUNT(*) AS n FROM sites').get() as { n: number }).n;

    const totalSeeds = (db.prepare(
      'SELECT COUNT(*) AS n FROM site_source_seeds',
    ).get() as { n: number }).n;

    // All sites now have a Destatis group (either canonical I–VII or 'unclassified')
    const gewerkDistRows = db.prepare(
      `SELECT COALESCE(m.target_code, 'unclassified') AS gewerk_group, COUNT(*) AS n
       FROM sites s
       LEFT JOIN site_hwo_mappings m ON m.site_id = s.id AND m.mapping_system = 'destatis_group'
       GROUP BY COALESCE(m.target_code, 'unclassified')
       ORDER BY n DESC`,
    ).all() as { gewerk_group: string; n: number }[];

    // Use authoritative bundesland from sites table (calculated by EnrichBundeslandGogol)
    // instead of joining site_source_seeds to avoid double-counting sites with multiple postal codes
    type SiteGeoRow = {
      site_id: number;
      gewerk_group: string | null;
      bundesland: string | null;
    };

    const siteGeoRows = db
      .prepare(
        `SELECT s.id as site_id, m.target_code as gewerk_group, s.bundesland
         FROM sites s
         LEFT JOIN site_hwo_mappings m ON m.site_id = s.id AND m.mapping_system = 'destatis_group'
         WHERE s.bundesland IS NOT NULL AND s.bundesland != '' AND s.bundesland != 'Unknown'`,
      )
      .all() as SiteGeoRow[];

    db.close();

    // Build distribution: canonical groups in Roman order, then unclassified last
    const gewerkDistribution: Record<string, number> = {};
    const canonicalGroups: Record<string, number> = {};
    let unclassifiedCount = 0;

    for (const row of gewerkDistRows) {
      if (row.gewerk_group === 'unclassified') {
        unclassifiedCount = row.n;
      } else {
        canonicalGroups[row.gewerk_group] = row.n;
      }
    }

    const ROMAN_GROUPS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
    const romanOrder = new Map<string, number>(ROMAN_GROUPS.map((g, i) => [g, i]));

    const sortRomanGroups = (entries: [string, number][]): [string, number][] => {
      return [...entries].sort((a, b) => {
        const ia = romanOrder.get(a[0]) ?? ROMAN_GROUPS.length;
        const ib = romanOrder.get(b[0]) ?? ROMAN_GROUPS.length;
        return ia - ib;
      });
    };

    const sortedCanonical = sortRomanGroups(Object.entries(canonicalGroups));
    for (const [group, count] of sortedCanonical) {
      gewerkDistribution[group] = count;
    }
    // Add unclassified at the end
    gewerkDistribution['unclassified'] = unclassifiedCount;

    // Build geographic distributions if geoIndex is available
    const stateDistribution: Record<string, number> = {};
    const stateGroupDistribution: Record<string, Record<string, number>> = {};

    if (geoIndex) {
      for (const row of siteGeoRows) {
        const state = row.bundesland; // Use authoritative bundesland directly
        const group = row.gewerk_group ?? 'unclassified';

        if (state) {
          stateDistribution[state] = (stateDistribution[state] ?? 0) + 1;

          if (!stateGroupDistribution[state]) {
            stateGroupDistribution[state] = {};
          }
          stateGroupDistribution[state][group] = (stateGroupDistribution[state][group] ?? 0) + 1;
        }
      }
    }

    const doneAt = new Date().toISOString();
    const outDir = ctx.getGogolOutputDir(this.id);

    const summary: Record<string, unknown> = {
      ownerApp: OWNER_APP,
      schemaVersion: CORE_SCHEMA_VERSION,
      coreDbPath: toFactoryRelativePath(coreDbPath),
      sha256,
      doneAt,
      stats: {
        totalUniqueSites: totalSites,
        seedsThisBatch: totalSeeds,
        gewerkDistribution,
      },
    };

    // Add geographic distributions if available
    if (geoIndex) {
      summary.geographicStats = {
        sitesWithGeographicData: Object.values(stateDistribution).reduce((a, b) => a + b, 0),
        stateDistribution,
        stateGroupDistribution,
      };
    }

    console.log(
      `[snapshot-harvest] Total unique sites: ${totalSites}, seeds this batch: ${totalSeeds}`,
    );

    await ctx.writeTextFile(
      path.join(outDir, 'harvest-snapshot.json'),
      JSON.stringify(summary, null, 2),
    );

    // Helper: render a flat distribution as an aligned markdown table (sorted by count desc)
    const renderDistTable = (header: [string, string], dist: Record<string, number>): string => {
      const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
      return markdownTable([header, ...sorted.map(([k, n]) => [k, String(n)])], { align: ['l', 'r'] });
    };

    const SENTINEL_LAST = new Set(['undefined', 'unclassified']);

    // Get all unique group names from 2D distribution, with sentinel values at the end
    const getAllGroups = (dist: Record<string, Record<string, number>>): string[] => {
      const groups = new Set<string>();
      for (const rowGroups of Object.values(dist)) {
        for (const groupName of Object.keys(rowGroups)) {
          groups.add(groupName);
        }
      }
      const normal = Array.from(groups).filter((g) => !SENTINEL_LAST.has(g)).sort((a, b) => {
        const ia = romanOrder.get(a) ?? ROMAN_GROUPS.length;
        const ib = romanOrder.get(b) ?? ROMAN_GROUPS.length;
        return ia - ib;
      });
      const last = Array.from(groups).filter((g) => SENTINEL_LAST.has(g)).sort();
      return [...normal, ...last];
    };

    // Helper: render a 2D distribution with groups as columns, sorted by total desc then key asc
    const render2DDistTable = (
      rowHeader: string,
      dist: Record<string, Record<string, number>>,
    ): string => {
      const allGroups = getAllGroups(dist);
      const tableHeader = [rowHeader, 'Total', ...allGroups];

      const rowEntries = Object.entries(dist)
        .map(([key, groups]) => ({
          key,
          total: Object.values(groups).reduce((a, b) => a + b, 0),
          groups,
        }))
        .sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          return a.key.localeCompare(b.key);
        });

      const rows = rowEntries.map(({ key, total, groups }) => [
        key,
        String(total),
        ...allGroups.map((g) => String(groups[g] ?? 0)),
      ]);

      return markdownTable([tableHeader, ...rows], { align: ['l', 'r', ...allGroups.map(() => 'r' as const)] });
    };

    // Build markdown sections
    const mdSections: string[] = [
      `# Harvest Snapshot`,
      ``,
      `**Harvest batch ID:** harvest  `,
      `**Owner app:** ${OWNER_APP}  `,
      `**Schema version:** ${CORE_SCHEMA_VERSION}  `,
      `**Completed at:** ${doneAt}`,
      ``,
      `## core.db`,
      ``,
      `- Path: \`${toFactoryRelativePath(coreDbPath)}\``,
      `- SHA-256: \`${sha256}\``,
      ``,
      `## Stats`,
      ``,
      markdownTable([['Metric', 'Value'], ['Total unique sites', String(totalSites)], ['Seeds this batch', String(totalSeeds)]], { align: ['l', 'r'] }),
      ``,
      `*Seeds this batch* = raw source entries (URLs/rows from input files). Multiple seeds may map to the same unique site.`,
      ``,
      `## Destatis group distribution`,
      ``,
      markdownTable(
        [['Group', 'Sites'], ...sortedCanonical.map(([g, n]) => [g, String(n)]), ['unclassified', String(unclassifiedCount)]],
        { align: ['l', 'r'] },
      ),
    ];

    // Add geographic distribution sections if available
    if (geoIndex && Object.keys(stateDistribution).length > 0) {
      mdSections.push(
        ``,
        `## Geographic Distribution by State (Bundesland)`,
        ``,
        `Unique sites distribution by German state, from authoritative bundesland column.`,
        ``,
        renderDistTable(['State', 'Sites'], stateDistribution),
        ``,
        `## Geographic Distribution by State and Destatis Group`,
        ``,
        `Distribution of unique sites by state and Destatis group.`,
        ``,
        render2DDistTable('State', stateGroupDistribution),
      );
    }

    mdSections.push(
      ``,
      `> core.db is now ready for \`ATTACH DATABASE\` by downstream pipelines.`,
      `> Pass \`sha256\` to hdri-scoring as \`pipeline_inputs.snapshot_sha256\`.`,
    );

    await ctx.writeTextFile(path.join(outDir, 'harvest-snapshot.md'), mdSections.join('\n'));

    console.log(`[snapshot-harvest] Done. Snapshot written to ${outDir}`);
  }
}

