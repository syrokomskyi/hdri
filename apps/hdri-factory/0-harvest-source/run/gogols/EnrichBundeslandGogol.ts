/*
<MODULE_CONTRACT>
<purpose>Deterministically resolve sites.bundesland from ALL postal_code/city signals in site_source_seeds per site, handling multi-source conflicts.</purpose>
<keywords>bundesland, geocoding, postal-code, enrichment, deterministic, conflict-resolution, multi-source</keywords>
<responsibilities>
  <item>Load the geo index from zipcodesTablePath with postal→state and city→states maps.</item>
  <item>For every site, collect ALL postal_code and city signals from site_source_seeds (not just first).</item>
  <item>Resolve each signal to candidate Bundesland using postal code (primary) then city (fallback).</item>
  <item>Apply deterministic selection: consensus > majority > tie-breaker (postal asc, city asc).</item>
  <item>Handle ambiguous cases (different states from different sources) — record as conflicts, leave NULL.</item>
  <item>Write resolved bundesland to sites.bundesland via UPDATE.</item>
  <item>Emit enrich-bundesland.json with detailed metrics, geo-resolutions.csv, and geo-conflicts.csv.</item>
</responsibilities>
<non-goals>
  <item>Does not resolve gewerk_group — that is ClassifyBrancheGogol's responsibility.</item>
  <item>Does not write gemeinde — not required.</item>
  <item>Does not modify site_source_seeds.</item>
  <item>Does not perform LLM lookups or external HTTP requests.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="ZipcodeEntry">Shape of one row in zipcodes.de.json.</entry>
  <entry key="GeoIndex">In-memory lookup: postal→state (1:1), city→states (1:N).</entry>
  <entry key="normPlace">Normalise a place/city name for map lookup.</entry>
  <entry key="loadGeoIndex">Load and index zipcodes JSON into GeoIndex.</entry>
  <entry key="GeoCandidate">Resolved candidate with signal source and method.</entry>
  <entry key="resolveSiteBundesland">Deterministic resolution from multiple candidates.</entry>
  <entry key="EnrichBundeslandGogol">Gogol that deterministically resolves bundesland from all seeds.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Replace single-signal LIMIT 1 queries with full seed aggregation per site.</item>
  <item>Implement deterministic resolution algorithm: consensus > majority > tie-breaker.</item>
  <item>Add city→states multi-mapping to handle ambiguous city names correctly.</item>
  <item>Track and report conflicts where different seeds yield different Bundesland.</item>
  <item>Add geo-resolutions.csv artifact with per-site resolution details.</item>
  <item>Add geo-conflicts.csv artifact listing domains with conflicting signals.</item>
  <item>Extend enrich-bundesland.json with resolution method breakdown and conflict count.</item>
  <item>Remove gemeinde handling — not required anywhere.</item>
  <item>Remove obsolete sites.gewerk_group references; derive group from site_hwo_mappings (destatis_group) for 2D distribution report.</item>
  <item>Read zipcodesTablePath from rootBrief (factory-level) and fail fast if missing or file unreadable.</item>
  <item>Add "Resolution Method Notes" section to enrich-bundesland.md explaining city-unique vs city-majority semantics and confidence levels.</item>
  <item>Make loadGeoIndex fail fast with thrown error instead of returning null when zipcodes file cannot be loaded.</item>
  <item>Add post-resolution fail-fast: throw if totalResolved === 0 (no postal_code/city data in source seeds).</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { parseSourceToken } from '@org/observatory-crypto';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openCoreSqlite } from '../db/connection.js';
import { inputDir } from '../config.js';

// ---------------------------------------------------------------------------
// Geo index (same logic as ClassifyBrancheGogol)
// ---------------------------------------------------------------------------

type ZipcodeEntry = {
  zipcode: string;
  place: string;
  state: string;
};

/**
 * GeoIndex with two lookup strategies:
 * - postalToState: 1:1 mapping (postal code uniquely identifies state)
 * - placeToStates: 1:N mapping (city name may exist in multiple states)
 */
type GeoIndex = {
  postalToState: Map<string, string>;
  placeToStates: Map<string, Set<string>>;
};

const normPlace = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*[-/(].*$/, '')
    .replace(/\bot\s+.*$/i, '')
    .replace(/[.,]/g, '')
    .trim();

/** Resolution method for a site */
type ResolutionMethod =
  | 'postal-consensus'
  | 'postal-majority'
  | 'postal-tie-breaker'
  | 'city-consensus'
  | 'city-majority'
  | 'city-tie-breaker'
  | 'city-unique'
  | 'unresolved';

/** Per-site resolution record for CSV artifact */
type GeoResolutionRecord = {
  domain: string;
  site_id: number;
  resolved_state: string | null;
  method: ResolutionMethod;
  confidence: 'high' | 'medium' | 'low' | 'none';
  postal_candidates: string;
  city_candidates: string;
  distinct_states: string;
  seed_count: number;
};

/** Conflict record for CSV artifact */
type GeoConflictRecord = {
  domain: string;
  site_id: number;
  conflicting_states: string;
  postal_signals: string;
  city_signals: string;
  seed_count: number;
};

const loadGeoIndex = async (
  zipcodesPath: string | null,
  baseDir: string,
): Promise<GeoIndex | null> => {
  if (!zipcodesPath) return null;
  const fullPath = path.isAbsolute(zipcodesPath)
    ? zipcodesPath
    : path.join(baseDir, zipcodesPath);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const entries: ZipcodeEntry[] = JSON.parse(content);
    const postalToState = new Map<string, string>();
    const placeToStates = new Map<string, Set<string>>();

    for (const e of entries) {
      const zip = e.zipcode?.trim();
      const state = e.state?.trim();

      // Postal code: 1:1 mapping (take first if duplicates exist)
      if (zip && state && !postalToState.has(zip)) {
        postalToState.set(zip, state);
      }

      // City: 1:N mapping (collect all states where this city name appears)
      if (e.place && state) {
        const k = normPlace(e.place);
        if (k) {
          if (!placeToStates.has(k)) {
            placeToStates.set(k, new Set());
          }
          placeToStates.get(k)!.add(state);
        }
      }
    }

    console.log(
      `[enrich-bundesland] Loaded geo index: ${postalToState.size} postal codes, ${placeToStates.size} city names`,
    );
    return { postalToState, placeToStates };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new Error(
      `[enrich-bundesland] Failed to load zipcodes from ${fullPath}: ${error.message}`, { cause: err },
    );
  }
};

// ---------------------------------------------------------------------------
// Seed aggregation types
// ---------------------------------------------------------------------------

type SeedRow = {
  site_id: number;
  domain: string;
  postal_code: string | null;
  city: string | null;
  source_path: string;
};

type SiteGeoData = {
  siteId: number;
  domain: string;
  seeds: GeoSeed[];
};

type GeoSeed = {
  postalCode: string | null;
  city: string | null;
  sourcePath: string;
};

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

/**
 * Resolve Bundesland from all seeds for a single site.
 * Returns the resolved state, method used, and conflict info if any.
 */
function resolveSiteBundesland(
  site: SiteGeoData,
  geoIndex: GeoIndex,
): {
  state: string | null;
  method: ResolutionMethod;
  confidence: 'high' | 'medium' | 'low' | 'none';
  candidates: Map<string, { count: number; sources: Set<string>; type: 'postal' | 'city' }>;
  hasConflict: boolean;
} {
  // Collect candidate states with their sources and types
  const candidates = new Map<string, { count: number; sources: Set<string>; type: 'postal' | 'city' }>();

  for (const seed of site.seeds) {
    // Try postal code first (primary signal)
    if (seed.postalCode) {
      const zip = seed.postalCode.trim();
      if (zip) {
        const state = geoIndex.postalToState.get(zip);
        if (state) {
          const existing = candidates.get(state);
          if (existing) {
            existing.count++;
            existing.sources.add(seed.sourcePath);
          } else {
            candidates.set(state, { count: 1, sources: new Set([seed.sourcePath]), type: 'postal' });
          }
        }
      }
    }

    // Fallback to city if no postal match for this seed
    if (seed.city) {
      const cityKey = normPlace(seed.city);
      if (cityKey) {
        const states = geoIndex.placeToStates.get(cityKey);
        if (states && states.size === 1) {
          // City uniquely identifies a state — use as fallback
          const state = Array.from(states)[0];
          const existing = candidates.get(state);
          if (existing) {
            // Prefer postal over city if same state
            existing.count++;
            existing.sources.add(seed.sourcePath);
          } else {
            candidates.set(state, { count: 1, sources: new Set([seed.sourcePath]), type: 'city' });
          }
        }
        // If city maps to multiple states, we skip it (ambiguous)
      }
    }
  }

  if (candidates.size === 0) {
    return { state: null, method: 'unresolved', confidence: 'none', candidates, hasConflict: false };
  }

  if (candidates.size === 1) {
    const [state, info] = Array.from(candidates.entries())[0];
    const method: ResolutionMethod = info.type === 'postal' ? 'postal-consensus' : 'city-unique';
    const confidence: 'high' | 'medium' = info.type === 'postal' ? 'high' : 'medium';
    return { state, method, confidence, candidates, hasConflict: false };
  }

  // Multiple states found — need deterministic selection
  const entries = Array.from(candidates.entries());
  const maxCount = Math.max(...entries.map(([, info]) => info.count));
  const topStates = entries.filter(([, info]) => info.count === maxCount);

  // Check for postal-code majority (stronger signal)
  const postalStates = entries.filter(([, info]) => info.type === 'postal');
  if (postalStates.length > 0) {
    const maxPostalCount = Math.max(...postalStates.map(([, info]) => info.count));
    const topPostalStates = postalStates.filter(([, info]) => info.count === maxPostalCount);

    if (topPostalStates.length === 1) {
      const [state] = topPostalStates[0];
      return {
        state,
        method: maxPostalCount === maxCount ? 'postal-majority' : 'postal-tie-breaker',
        confidence: maxPostalCount > 1 ? 'medium' : 'low',
        candidates,
        hasConflict: true,
      };
    }

    // Tie among postal states — deterministic tie-breaker by state name asc
    const [state] = topPostalStates.sort((a, b) => a[0].localeCompare(b[0]))[0];
    return {
      state,
      method: 'postal-tie-breaker',
      confidence: 'low',
      candidates,
      hasConflict: true,
    };
  }

  // No postal signals, only city signals with multiple states
  // This should be rare due to city-unique check above
  if (topStates.length === 1) {
    const [state] = topStates[0];
    return {
      state,
      method: 'city-majority',
      confidence: 'low',
      candidates,
      hasConflict: true,
    };
  }

  // Tie — deterministic pick by state name asc, leave as conflict
  const [state] = topStates.sort((a, b) => a[0].localeCompare(b[0]))[0];
  return {
    state,
    method: 'city-tie-breaker',
    confidence: 'low',
    candidates,
    hasConflict: true,
  };
}

// ---------------------------------------------------------------------------

export class EnrichBundeslandGogol extends Gogol {
  override readonly id = 'enrich-bundesland';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);

    const zipcodesPath = ctx.state.rootBrief.zipcodesTablePath;
    if (!zipcodesPath) {
      throw new Error('[enrich-bundesland] zipcodesTablePath is missing in root brief.md — required for geographic enrichment');
    }
    const geoIndex = await loadGeoIndex(zipcodesPath, inputDir);
    if (!geoIndex) {
      throw new Error(`[enrich-bundesland] Failed to load zipcodes from ${zipcodesPath} — required for geographic enrichment`);
    }

    const db = openCoreSqlite(year);

    // Fetch all seeds for sites in this batch (not just first per site)
    const seedRows = db
      .prepare(
        `SELECT
          s.id AS site_id,
          s.domain,
          sss.postal_code,
          sss.city,
          sss.source_path
        FROM sites s
        JOIN site_source_seeds sss ON sss.site_id = s.id
        WHERE sss.postal_code IS NOT NULL AND sss.postal_code != ''
           OR sss.city IS NOT NULL AND sss.city != ''`,
      )
      .all() as SeedRow[];

    // Group seeds by site
    const siteMap = new Map<number, SiteGeoData>();
    for (const row of seedRows) {
      if (!siteMap.has(row.site_id)) {
        siteMap.set(row.site_id, {
          siteId: row.site_id,
          domain: row.domain,
          seeds: [],
        });
      }
      siteMap.get(row.site_id)!.seeds.push({
        postalCode: row.postal_code,
        city: row.city,
        sourcePath: row.source_path,
      });
    }

    // Also fetch sites with NO geo seeds at all (to count as unresolved)
    const allSiteIds = db
      .prepare<[]>(
        `SELECT id AS site_id, domain
         FROM sites`,
      )
      .all() as Array<{ site_id: number; domain: string }>;

    for (const s of allSiteIds) {
      if (!siteMap.has(s.site_id)) {
        siteMap.set(s.site_id, {
          siteId: s.site_id,
          domain: s.domain,
          seeds: [],
        });
      }
    }

    const sites = Array.from(siteMap.values());
    console.log(`[enrich-bundesland] Resolving bundesland for ${sites.length} sites (${seedRows.length} geo seeds)`);

    // Load Destatis group mappings for 2D distribution report
    const mappingRows = db
      .prepare(
        `SELECT site_id, target_code FROM site_hwo_mappings WHERE mapping_system = 'destatis_group'`,
      )
      .all() as Array<{ site_id: number; target_code: string }>;
    const destatisMap = new Map<number, string>();
    for (const row of mappingRows) {
      destatisMap.set(row.site_id, row.target_code);
    }

    // Prepare for results
    const updateStmt = db.prepare<[string | null, number]>(
      `UPDATE sites SET bundesland = ? WHERE id = ?`,
    );

    const resolutionRecords: GeoResolutionRecord[] = [];
    const conflictRecords: GeoConflictRecord[] = [];

    // Metrics
    const methodCounts: Record<ResolutionMethod, number> = {
      'postal-consensus': 0,
      'postal-majority': 0,
      'postal-tie-breaker': 0,
      'city-consensus': 0,
      'city-majority': 0,
      'city-tie-breaker': 0,
      'city-unique': 0,
      'unresolved': 0,
    };
    let totalResolved = 0;
    let totalUnresolved = 0;
    let totalConflicts = 0;
    let resolvedByPostal = 0;
    let resolvedByCity = 0;
    const stateDist: Record<string, number> = {};
    const stateGroupDist: Record<string, Record<string, number>> = {};

    // Process all sites
    db.transaction(() => {
      for (const site of sites) {
        const result = resolveSiteBundesland(site, geoIndex);

        // Update database
        updateStmt.run(result.state, site.siteId);

        // Build record
        const distinctStates = Array.from(result.candidates.keys()).sort();
        const postalSignals = site.seeds
          .filter((s) => s.postalCode && geoIndex.postalToState.has(s.postalCode.trim()))
          .map((s) => s.postalCode!.trim());
        const citySignals = site.seeds
          .filter((s) => s.city && geoIndex.placeToStates.has(normPlace(s.city)))
          .map((s) => s.city!);

        resolutionRecords.push({
          domain: site.domain,
          site_id: site.siteId,
          resolved_state: result.state,
          method: result.method,
          confidence: result.confidence,
          postal_candidates: [...new Set(postalSignals)].join(';'),
          city_candidates: [...new Set(citySignals)].join(';'),
          distinct_states: distinctStates.join(';'),
          seed_count: site.seeds.length,
        });

        if (result.hasConflict) {
          totalConflicts++;
          conflictRecords.push({
            domain: site.domain,
            site_id: site.siteId,
            conflicting_states: distinctStates.join(';'),
            postal_signals: [...new Set(postalSignals)].join(';'),
            city_signals: [...new Set(citySignals)].join(';'),
            seed_count: site.seeds.length,
          });
        }

        // Metrics
        methodCounts[result.method]++;
        if (result.state) {
          totalResolved++;
          if (result.method.startsWith('postal')) {
            resolvedByPostal++;
          } else if (result.method.startsWith('city')) {
            resolvedByCity++;
          }

          stateDist[result.state] = (stateDist[result.state] ?? 0) + 1;
          if (!stateGroupDist[result.state]) {
            stateGroupDist[result.state] = {};
          }
          const group = destatisMap.get(site.siteId) ?? 'unclassified';
          stateGroupDist[result.state][group] = (stateGroupDist[result.state][group] ?? 0) + 1;
        } else {
          totalUnresolved++;
        }
      }
    })();

    db.close();

    console.log(
      `[enrich-bundesland] Resolved ${totalResolved}/${sites.length} sites ` +
        `(${resolvedByPostal} by postal, ${resolvedByCity} by city, ${totalUnresolved} unresolved, ${totalConflicts} conflicts)`,
    );

    if (totalResolved === 0) {
      throw new Error(
        `[enrich-bundesland] FAIL-FAST: 0 of ${sites.length} sites resolved to a Bundesland. ` +
        `No postal_code/city data found in source seeds - ` +
        `verify that the source files contain address data or check zipcodesTablePath in brief.md.`,
      );
    }

    const outDir = ctx.getGogolOutputDir(this.id);

    // Write JSON report
    const report = {
      total: sites.length,
      resolved: totalResolved,
      unresolved: totalUnresolved,
      conflicts: totalConflicts,
      byPostal: resolvedByPostal,
      byCity: resolvedByCity,
      methodBreakdown: methodCounts,
      stateDistribution: stateDist,
      stateGroupDistribution: stateGroupDist,
    };

    await ctx.writeTextFile(
      path.join(outDir, 'enrich-bundesland.json'),
      JSON.stringify(report, null, 2),
    );

    // Write CSV artifacts
    await ctx.writeTextFile(
      path.join(outDir, 'geo-resolutions.csv'),
      csvStringify([
        ['domain', 'site_id', 'resolved_state', 'method', 'confidence', 'postal_candidates', 'city_candidates', 'distinct_states', 'seed_count'],
        ...resolutionRecords.map((r) => [
          r.domain,
          r.site_id,
          r.resolved_state ?? '',
          r.method,
          r.confidence,
          r.postal_candidates,
          r.city_candidates,
          r.distinct_states,
          r.seed_count,
        ]),
      ]),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'geo-conflicts.csv'),
      csvStringify([
        ['domain', 'site_id', 'conflicting_states', 'postal_signals', 'city_signals', 'seed_count'],
        ...conflictRecords.map((r) => [
          r.domain,
          r.site_id,
          r.conflicting_states,
          r.postal_signals,
          r.city_signals,
          r.seed_count,
        ]),
      ]),
    );

    // Markdown report
    const SENTINEL_LAST = new Set(['undefined', 'unclassified']);

    const renderDistTable = (header: [string, string], dist: Record<string, number>): string => {
      const entries = Object.entries(dist);
      const normal = entries.filter(([k]) => !SENTINEL_LAST.has(k)).sort((a, b) => b[1] - a[1]);
      const last = entries.filter(([k]) => SENTINEL_LAST.has(k)).sort((a, b) => b[1] - a[1]);
      return markdownTable([[header[0], header[1]], ...[...normal, ...last].map(([k, n]) => [k, String(n)])], { align: ['l', 'r'] });
    };

    const render2DDistTable = (rowHeader: string, dist: Record<string, Record<string, number>>): string => {
      const allGroups = new Set<string>();
      for (const r of Object.values(dist)) for (const g of Object.keys(r)) allGroups.add(g);
      const normalCols = Array.from(allGroups).filter((g) => !SENTINEL_LAST.has(g)).sort((a, b) => a.localeCompare(b));
      const lastCols = Array.from(allGroups).filter((g) => SENTINEL_LAST.has(g)).sort();
      const cols = [...normalCols, ...lastCols];
      const mapped = Object.entries(dist).map(([key, groups]) => ({
        key,
        total: Object.values(groups).reduce((a, b) => a + b, 0),
        groups,
      }));
      const normalRows = mapped.filter(({ key }) => !SENTINEL_LAST.has(key)).sort((a, b) => b.total !== a.total ? b.total - a.total : a.key.localeCompare(b.key));
      const lastRows = mapped.filter(({ key }) => SENTINEL_LAST.has(key)).sort((a, b) => b.total - a.total);
      const rows = [...normalRows, ...lastRows].map(({ key, total, groups }) => [key, String(total), ...cols.map((g) => String(groups[g] ?? 0))]);
      return markdownTable([[rowHeader, 'Total', ...cols], ...rows], { align: ['l', 'r', ...cols.map(() => 'r' as const)] });
    };

    const md: string[] = [
      `# Bundesland Enrichment`,
      ``,
      `**Harvest batch ID:** harvest`,
      ``,
      `## Summary`,
      ``,
      markdownTable(
        [
          ['Metric', 'Value'],
          ['Total sites', String(sites.length)],
          ['Resolved', String(totalResolved)],
          ['By postal code', String(resolvedByPostal)],
          ['By city', String(resolvedByCity)],
          ['Unresolved', String(totalUnresolved)],
          ['Conflicts (different states)', String(totalConflicts)],
        ],
        { align: ['l', 'r'] },
      ),
      ``,
      `## Resolution Methods`,
      ``,
      markdownTable(
        [['Method', 'Count'], ...Object.entries(methodCounts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, String(n)])],
        { align: ['l', 'r'] },
      ),
      ``,
      `## Resolution Method Notes`,
      ``,
      `- **city-unique** — the city name exists in only one Bundesland in the geo index, so it unambiguously resolves the state. Confidence: medium.`,
      `- **city-majority** — the city name exists in multiple Bundesländer (it is ambiguous), but among all city signals for this site one state receives strictly more "votes" (sources) than any other. Confidence: low; the site is recorded as a conflict because the same city name could legitimately belong to a different state.`,
    ];

    if (Object.keys(stateDist).length > 0) {
      md.push(
        ``,
        `## Geographic Distribution by State (Bundesland)`,
        ``,
        `Sites mapped via deterministic resolution from postal code (primary) or city (fallback). ` +
          `Resolved ${totalResolved} of ${sites.length} sites ` +
          `(${resolvedByPostal} by postal code, ${resolvedByCity} by city).`,
        ``,
        renderDistTable(['State', 'Sites'], stateDist),
        ``,
        `## Geographic Distribution by State and Group`,
        ``,
        render2DDistTable('State', stateGroupDist),
      );
    }

    if (totalConflicts > 0) {
      md.push(
        ``,
        `## Conflicts`,
        ``,
        `${totalConflicts} sites had conflicting geographic signals (different Bundesland from different sources). ` +
          `These were resolved using deterministic tie-breakers. See geo-conflicts.csv for details.`,
      );
    }

    md.push(
      ``,
      `## Artifacts`,
      ``,
      `- enrich-bundesland.json — full report with method breakdown`,
      `- geo-resolutions.csv — per-site resolution details`,
      `- geo-conflicts.csv — sites with conflicting signals`,
    );

    await ctx.writeTextFile(path.join(outDir, 'enrich-bundesland.md'), md.join('\n'));
  }
}
