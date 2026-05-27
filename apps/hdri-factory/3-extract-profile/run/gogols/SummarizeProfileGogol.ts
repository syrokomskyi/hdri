/*
<MODULE_CONTRACT>
<purpose>Final step in the site-profile pipeline, generating summary reports with geographic analysis.</purpose>
<keywords>profile, summary, statistics, geographic, provenance</keywords>
<responsibilities>
  <item>Compute SHA-256 hash of pages.db for provenance tracking.</item>
  <item>Aggregate page observations and content extraction statistics.</item>
  <item>Generate geographic distribution reports by state from zipcodes data.</item>
  <item>Export summary JSON and Markdown reports with key metrics.</item>
</responsibilities>
<non-goals>
  <item>Do not perform raw data crawling or extraction here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="loadGeoIndex">Loads and indexes zipcodes data for postal code lookups.</entry>
  <entry key="observations">Count of page observations for the current batch.</entry>
  <entry key="uniqueContent">Count of unique content hashes observed.</entry>
  <entry key="stateDistribution">Distribution of sites by German state (Bundesland).</entry>
  <entry key="stateGroupDistribution">Distribution of sites by state and GewerkGroup.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding to define module responsibilities.</item>
  <item>Add geographic distribution reports by state from zipcodes data.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Add copyright year aggregation: count of sites with detected year and distribution by year.</item>
  <item>Replace content_extractions / content_contacts queries with ext_* flat table queries after gogol split.</item>
  <item>Add aggregation of all 37 new ext_* signal tables (Schema.org, Legal, Content, External links, Social) into profile-snapshot.json and profile-snapshot.md.</item>
  <item>Fix openingHoursCount query: ext_opening_hours uses 'text' column, not 'present'.</item>
  <item>Fix geographic distribution: remove broken query that tried to access page_observations from registry.db, use authoritative sites.bundesland instead.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Normalise pagesDbPath to relative in profile-snapshot.json artifact using toFactoryRelativePath so paths are relative to apps/hdri-factory.</item>
  <item>Fix zipcodes path resolution: remove erroneous '..' so relative zipcodesTablePath resolves from shared factory inputDir (apps/hdri-factory/.input).</item>
  <item>Make loadGeoIndex fail fast with thrown error instead of returning null when zipcodesTablePath is missing or file cannot be loaded.</item>
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
import { openPagesDb } from '../db/connection.js';
import { getPagesDbPath } from '../paths.js';

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

export class SummarizeProfileGogol extends Gogol {
  override readonly id = 'summarize-profile';

  /**
   * Load and index zipcodes data for fast postal code lookups.
   * Throws if zipcodesTablePath is missing in brief or file cannot be read.
   */
  private async loadGeoIndex(ctx: PipelineContext): Promise<GeoIndex> {
    const zipcodesPath = ctx.state.brief.zipcodesTablePath;
    if (!zipcodesPath) {
      throw new Error('[summarize-profile] zipcodesTablePath is missing in brief.md — required for geographic reports');
    }

    const fullPath = path.isAbsolute(zipcodesPath)
      ? zipcodesPath
      : path.join(ctx.inputDir, zipcodesPath);

    console.log(`[summarize-profile] Loading zipcodes from ${zipcodesPath}...`);

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
        `[summarize-profile] Indexed ${postalToState.size} postal codes to states`,
      );

      return { postalToState };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(
        `[summarize-profile] Failed to load zipcodes data from ${fullPath}: ${err.message}`, { cause: error },
      );
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { pagesDbName, brief } = ctx.state;
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;
    const pagesDbPath = getPagesDbPath(year, half);
    const db = openPagesDb(pagesDbPath);

    // Load geographic index for reports
    const geoIndex = await this.loadGeoIndex(ctx);

    // Aggregate stats
    const observations = (db.prepare(
      `SELECT COUNT(*) AS n FROM page_observations`,
    ).get() as { n: number }).n;

    const uniqueContent = (db.prepare(
      `SELECT COUNT(DISTINCT content_sha256) AS n FROM page_observations`,
    ).get() as { n: number }).n;

    const extractions = (db.prepare(
      `SELECT COUNT(*) AS n FROM ext_impressum`,
    ).get() as { n: number }).n;

    /** Helper: count rows WHERE present = 1 in any ext_* table */
    const countPresent = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE present = 1`).get() as { n: number }).n;

    // Original 5 signals
    const impressumCount = countPresent('ext_impressum');
    const datenschutzCount = countPresent('ext_datenschutz');
    const cookieCount = countPresent('ext_cookie_banner');
    const openingHoursCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM ext_opening_hours WHERE text IS NOT NULL`,
    ).get() as { n: number }).n;

    const copyrightYearCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM ext_copyright_year WHERE year IS NOT NULL`,
    ).get() as { n: number }).n;

    const copyrightYearDist = (db.prepare(
      `SELECT year, COUNT(*) AS n
       FROM ext_copyright_year
       WHERE year IS NOT NULL
       GROUP BY year
       ORDER BY year DESC`,
    ).all() as { year: number; n: number }[]);

    // Schema.org signals
    const schemaSignals: Record<string, number> = {
      local_business:     countPresent('ext_schema_local_business'),
      service:            countPresent('ext_schema_service'),
      faq:                countPresent('ext_schema_faq'),
      how_to:             countPresent('ext_schema_how_to'),
      breadcrumb:         countPresent('ext_schema_breadcrumb'),
      opening_hours_spec: countPresent('ext_schema_opening_hours_spec'),
      person:             countPresent('ext_schema_person'),
      review:             countPresent('ext_schema_review'),
      product:            countPresent('ext_schema_product'),
    };

    // Legal page signals
    const legalSignals: Record<string, number> = {
      bfsg:    countPresent('ext_bfsg_page'),
      agb:     countPresent('ext_agb_page'),
      widerruf: countPresent('ext_widerruf_page'),
      versand: countPresent('ext_versand_page'),
    };

    // Content signals
    const contentSignals: Record<string, number> = {
      contact_form:   countPresent('ext_contact_form'),
      portfolio:      countPresent('ext_portfolio'),
      map:            countPresent('ext_map'),
      team_page:      countPresent('ext_team_page'),
      testimonials:   countPresent('ext_testimonials'),
      certifications: countPresent('ext_certifications'),
      awards:         countPresent('ext_awards'),
      memberships:    countPresent('ext_memberships'),
      meister:        countPresent('ext_meister'),
      case_studies:   countPresent('ext_case_studies'),
    };

    // External link signals
    const extLinkSignals: Record<string, number> = {
      handelsregister:      countPresent('ext_link_handelsregister'),
      unternehmensregister: countPresent('ext_link_unternehmensregister'),
      kammern:              countPresent('ext_link_kammern'),
      industry_catalogs:    countPresent('ext_link_industry_catalogs'),
      google_business:      countPresent('ext_link_google_business'),
    };

    // Social platform signals
    const socialSignals: Record<string, number> = {
      facebook:  countPresent('ext_social_facebook'),
      instagram: countPresent('ext_social_instagram'),
      youtube:   countPresent('ext_social_youtube'),
      xing:      countPresent('ext_social_xing'),
      linkedin:  countPresent('ext_social_linkedin'),
      tiktok:    countPresent('ext_social_tiktok'),
      whatsapp:  countPresent('ext_social_whatsapp'),
      pinterest: countPresent('ext_social_pinterest'),
      twitter:   countPresent('ext_social_twitter'),
    };

    // Gather geographic data using authoritative bundesland from sites table
    // (calculated by EnrichBundeslandGogol in the harvest pipeline)
    type SiteGeoRow = {
      site_id: number;
      gewerk_group: string | null;
      bundesland: string | null;
    };

    let siteGeoRows: SiteGeoRow[] = [];

    if (geoIndex) {
      try {
        const registryDbPath = path.isAbsolute(brief.registryDbPath)
          ? brief.registryDbPath
          : path.join(ctx.inputDir, '..', brief.registryDbPath);

        // Attach registry.db to pages.db to access sites table
        const safeRegistryPath = registryDbPath.replace(/\\/g, '/').replace(/'/g, "''");
        db.prepare(`ATTACH DATABASE '${safeRegistryPath}' AS registry`).run();

        // Query to get unique sites with their gewerk_group and bundesland
        // Join sites (from registry.db) with site_pages and page_observations (from pages.db)
        siteGeoRows = db
          .prepare(
            `SELECT DISTINCT s.id as site_id, s.gewerk_group, s.bundesland
             FROM registry.sites s
             JOIN site_pages sp ON sp.site_id = s.id
             JOIN page_observations po ON po.site_page_id = sp.id`,
          )
          .all() as SiteGeoRow[];

        db.prepare(`DETACH DATABASE registry`).run();
      } catch (error) {
        console.error(`[summarize-profile] Failed to query geographic data: ${error}`);
      }
    }

    db.close();

    console.log(`[summarize-profile] Computing SHA-256 of ${pagesDbName}.db...`);
    const sha256 = await hashDatabaseFile(pagesDbPath);
    console.log(`[summarize-profile] sha256=${sha256}`);

    const doneAt = new Date().toISOString();
    const pct = (n: number) =>
      observations > 0 ? `${Math.round((100 * n) / observations)}%` : '0%';

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

    console.log(
      `[summarize-profile] Done. observations=${observations} uniqueContent=${uniqueContent} ` +
        `impressum=${impressumCount} datenschutz=${datenschutzCount} openingHours=${openingHoursCount}` +
        (geoIndex ? ` geoSites=${siteGeoRows.length}` : ''),
    );

    const outDir = ctx.getGogolOutputDir(this.id);

    const snapshot: Record<string, unknown> = {
      doneAt,
      pagesDbName,
      pagesDbPath: toFactoryRelativePath(pagesDbPath),
      sha256,
      observationsThisBatch: observations,
      uniqueContentHashes: uniqueContent,
      extractionsTotal: extractions,
      // Original 5 signals
      impressumPresent: impressumCount,
      datenschutzPresent: datenschutzCount,
      cookieBannerPresent: cookieCount,
      openingHoursPresent: openingHoursCount,
      copyrightYearPresent: copyrightYearCount,
      copyrightYearDistribution: Object.fromEntries(copyrightYearDist.map((r) => [String(r.year), r.n])),
      // New signal groups
      schemaOrg: schemaSignals,
      legalPages: legalSignals,
      contentSignals,
      externalLinks: extLinkSignals,
      socialPlatforms: socialSignals,
    };

    // Add geographic distributions if available
    if (geoIndex && Object.keys(stateDistribution).length > 0) {
      snapshot.geographicStats = {
        sitesWithGeographicData: Object.values(stateDistribution).reduce((a, b) => a + b, 0),
        stateDistribution,
        stateGroupDistribution,
      };
    }

    await ctx.writeTextFile(
      path.join(outDir, 'profile-snapshot.json'),
      JSON.stringify(snapshot, null, 2),
    );

    // Helper: render a flat distribution as an aligned markdown table (sorted by count desc)
    const renderDistTable = (header: [string, string], dist: Record<string, number>): string => {
      const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
      return markdownTable([header, ...sorted.map(([k, n]) => [k, String(n)])], { align: ['l', 'r'] });
    };

    // Get all unique group names from 2D distribution, sorted alphabetically
    const getAllGroups = (dist: Record<string, Record<string, number>>): string[] => {
      const groups = new Set<string>();
      for (const rowGroups of Object.values(dist)) {
        for (const groupName of Object.keys(rowGroups)) {
          groups.add(groupName);
        }
      }
      return Array.from(groups).sort((a, b) => a.localeCompare(b));
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
    /** Render a signal-group Record as a markdown table sorted by count desc */
    const renderSignalTable = (signals: Record<string, number>): string =>
      markdownTable(
        [['Signal', 'Pages', '%'], ...Object.entries(signals)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => [k, String(n), pct(n)])],
        { align: ['l', 'r', 'r'] },
      );

    const mdSections: string[] = [
      `# Site Profile Snapshot`,
      ``,
      `**Batch:** profile  `,
      `**DB:** \`${pagesDbName}.db\`  `,
      `**Completed:** ${doneAt}`,
      ``,
      `## Overview`,
      ``,
      markdownTable(
        [
          ['Metric', 'Value'],
          ['Pages observed this batch', String(observations)],
          ['Unique content hashes', String(uniqueContent)],
          ['Pages with impressum extraction', String(extractions)],
          ['Impressum found', `${impressumCount} (${pct(impressumCount)})`],
          ['Datenschutz found', `${datenschutzCount} (${pct(datenschutzCount)})`],
          ['Opening hours detected', `${openingHoursCount} (${pct(openingHoursCount)})`],
          ['Cookie banner detected', `${cookieCount} (${pct(cookieCount)})`],
          ['Copyright year detected', `${copyrightYearCount} (${pct(copyrightYearCount)})`],
          [`${pagesDbName}.db SHA-256`, `\`${sha256}\``],
        ],
        { align: ['l', 'r'] },
      ),
      ``,
      `## Schema.org Signals`,
      ``,
      renderSignalTable(schemaSignals),
      ``,
      `## Legal Page Signals`,
      ``,
      renderSignalTable(legalSignals),
      ``,
      `## Content Signals`,
      ``,
      renderSignalTable(contentSignals),
      ``,
      `## External Link Signals`,
      ``,
      renderSignalTable(extLinkSignals),
      ``,
      `## Social Platform Signals`,
      ``,
      renderSignalTable(socialSignals),
    ];

    // Add geographic distribution sections if available
    if (geoIndex && Object.keys(stateDistribution).length > 0) {
      mdSections.push(
        ``,
        `## Geographic Distribution by State (Bundesland)`,
        ``,
        `Unique sites distribution by German state, determined from postal codes.`,
        ``,
        renderDistTable(['State', 'Sites'], stateDistribution),
        ``,
        `## Geographic Distribution by State and Group`,
        ``,
        `Distribution of unique sites by state and GewerkGroup.`,
        ``,
        render2DDistTable('State', stateGroupDistribution),
      );
    }

    if (copyrightYearDist.length > 0) {
      const yearDist = Object.fromEntries(copyrightYearDist.map((r) => [String(r.year), r.n]));
      mdSections.push(
        ``,
        `## Copyright Year Distribution`,
        ``,
        `Distribution of most recent copyright year found on crawled pages.`,
        ``,
        renderDistTable(['Year', 'Pages'], yearDist),
      );
    }

    mdSections.push(
      ``,
      `> Downstream pipelines should verify the sha256 before attaching this DB.`,
    );

    await ctx.writeTextFile(path.join(outDir, 'profile-snapshot.md'), mdSections.join('\n'));
  }
}


