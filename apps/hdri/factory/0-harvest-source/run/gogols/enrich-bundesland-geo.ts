/*
<MODULE_CONTRACT>
<purpose>Geo index loading and deterministic Bundesland resolution for EnrichBundeslandGogol — this module handles enrich-bundesland-geo operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not write to the database or render reports.</item>
  <item>Does not perform external HTTP lookups.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted geo index loading and Bundesland resolution from EnrichBundeslandGogol.ts during file-size refactor.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";

export type ZipcodeEntry = {
  zipcode: string;
  place: string;
  state: string;
};

/**
 * GeoIndex with two lookup strategies:
 * - postalToState: 1:1 mapping (postal code uniquely identifies state)
 * - placeToStates: 1:N mapping (city name may exist in multiple states)
 */
export type GeoIndex = {
  postalToState: Map<string, string>;
  placeToStates: Map<string, Set<string>>;
};

export const normPlace = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*[-/(].*$/, "")
    .replace(/\bot\s+.*$/i, "")
    .replace(/[.,]/g, "")
    .trim();

/** Resolution method for a site */
export type ResolutionMethod =
  | "postal-consensus"
  | "postal-majority"
  | "postal-tie-breaker"
  | "city-consensus"
  | "city-majority"
  | "city-tie-breaker"
  | "city-unique"
  | "unresolved";

/** Per-site resolution record for CSV artifact */
export type GeoResolutionRecord = {
  domain: string;
  site_id: number;
  resolved_state: string | null;
  method: ResolutionMethod;
  confidence: "high" | "medium" | "low" | "none";
  postal_candidates: string;
  city_candidates: string;
  distinct_states: string;
  seed_count: number;
};

/** Conflict record for CSV artifact */
export type GeoConflictRecord = {
  domain: string;
  site_id: number;
  conflicting_states: string;
  postal_signals: string;
  city_signals: string;
  seed_count: number;
};

export const loadGeoIndex = async (
  zipcodesPath: string | null,
  baseDir: string,
): Promise<GeoIndex | null> => {
  if (!zipcodesPath) return null;
  const fullPath = path.isAbsolute(zipcodesPath) ? zipcodesPath : path.join(baseDir, zipcodesPath);
  try {
    const content = await fs.readFile(fullPath, "utf-8");
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
      `[enrich-bundesland] Failed to load zipcodes from ${fullPath}: ${error.message}`,
      { cause: err },
    );
  }
};

// ---------------------------------------------------------------------------
// Seed aggregation types
// ---------------------------------------------------------------------------

export type SeedRow = {
  site_id: number;
  domain: string;
  postal_code: string | null;
  city: string | null;
  source_path: string;
};

export type SiteGeoData = {
  siteId: number;
  domain: string;
  seeds: GeoSeed[];
};

export type GeoSeed = {
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
export function resolveSiteBundesland(
  site: SiteGeoData,
  geoIndex: GeoIndex,
): {
  state: string | null;
  method: ResolutionMethod;
  confidence: "high" | "medium" | "low" | "none";
  candidates: Map<string, { count: number; sources: Set<string>; type: "postal" | "city" }>;
  hasConflict: boolean;
} {
  // Collect candidate states with their sources and types
  const candidates = new Map<
    string,
    { count: number; sources: Set<string>; type: "postal" | "city" }
  >();

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
            candidates.set(state, {
              count: 1,
              sources: new Set([seed.sourcePath]),
              type: "postal",
            });
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
            candidates.set(state, { count: 1, sources: new Set([seed.sourcePath]), type: "city" });
          }
        }
        // If city maps to multiple states, we skip it (ambiguous)
      }
    }
  }

  if (candidates.size === 0) {
    return {
      state: null,
      method: "unresolved",
      confidence: "none",
      candidates,
      hasConflict: false,
    };
  }

  if (candidates.size === 1) {
    const [state, info] = Array.from(candidates.entries())[0];
    const method: ResolutionMethod = info.type === "postal" ? "postal-consensus" : "city-unique";
    const confidence: "high" | "medium" = info.type === "postal" ? "high" : "medium";
    return { state, method, confidence, candidates, hasConflict: false };
  }

  // Multiple states found — need deterministic selection
  const entries = Array.from(candidates.entries());
  const maxCount = Math.max(...entries.map(([, info]) => info.count));
  const topStates = entries.filter(([, info]) => info.count === maxCount);

  // Check for postal-code majority (stronger signal)
  const postalStates = entries.filter(([, info]) => info.type === "postal");
  if (postalStates.length > 0) {
    const maxPostalCount = Math.max(...postalStates.map(([, info]) => info.count));
    const topPostalStates = postalStates.filter(([, info]) => info.count === maxPostalCount);

    if (topPostalStates.length === 1) {
      const [state] = topPostalStates[0];
      return {
        state,
        method: maxPostalCount === maxCount ? "postal-majority" : "postal-tie-breaker",
        confidence: maxPostalCount > 1 ? "medium" : "low",
        candidates,
        hasConflict: true,
      };
    }

    // Tie among postal states — deterministic tie-breaker by state name asc
    const [state] = topPostalStates.sort((a, b) => a[0].localeCompare(b[0]))[0];
    return {
      state,
      method: "postal-tie-breaker",
      confidence: "low",
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
      method: "city-majority",
      confidence: "low",
      candidates,
      hasConflict: true,
    };
  }

  // Tie — deterministic pick by state name asc, leave as conflict
  const [state] = topStates.sort((a, b) => a[0].localeCompare(b[0]))[0];
  return {
    state,
    method: "city-tie-breaker",
    confidence: "low",
    candidates,
    hasConflict: true,
  };
}
