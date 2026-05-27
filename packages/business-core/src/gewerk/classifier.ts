/**
 * HWO entry classifier.
 * Two-layer classification:
 * 1. Primary: classifyToHwoUid() - exact HWO entry classification
 * 2. Fallback: classifyToMappingTarget() - mapping system target via heuristics
 */

import type {
  HwoClassificationInput,
  HwoClassificationResult,
  HwoUid,
  HwoMappingTarget,
  HwoMappingSystemId,
  HwoProvenance,
} from './types.js';
import { getHwoEntry, listHwoEntries, getHwoMappingTarget } from './loader.js';

// Normalization helper
function normalize(text: string | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[&,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keyword aliases for common terms
const KEYWORD_ALIASES: Record<string, string[]> = {
  elektro: ['elektro', 'elektrik', 'elektronik', 'elektrotechnik'],
  heizung: ['heizung', 'heizungsbau', 'ofenbau', 'kamin'],
  sanitär: ['sanitär', 'bad', 'badezimmer', 'dusche'],
  dach: ['dach', 'dachdecker', 'dachbau'],
  maurer: ['maurer', 'mauerwerk', 'beton', 'betonbauer'],
  maler: ['maler', 'lackierer', 'anstrich', 'streichen'],
  tischler: ['tischler', 'schreiner', 'holz', 'möbel'],
  metall: ['metall', 'metallbau', 'schlosser', 'schmied'],
  auto: ['auto', 'kraftfahrzeug', 'kfz', 'fahrzeug', 'autowerkstatt'],
  friseur: ['friseur', 'frisör', 'haare', 'haarschnitt'],
  bäcker: ['bäcker', 'brot', 'konditorei', 'konditor', 'gebäck'],
  fleischer: ['fleischer', 'metzger', 'wurst', 'fleisch'],
  optiker: ['optiker', 'brillen', 'augenoptik'],
  fotograf: ['fotograf', 'foto', 'bilder'],
  drucker: ['druckerei', 'druck', 'print'],
  glaser: ['glaser', 'glas', 'fenster', 'verglasung'],
  sanitärinstallateur: ['installateur', 'klempner', 'rohr', 'wasser'],
};

// Build reverse mapping from alias to keyword
const ALIAS_TO_KEYWORD: Record<string, string> = {};
for (const [keyword, aliases] of Object.entries(KEYWORD_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_KEYWORD[alias] = keyword;
  }
}

// Mapping from keywords to HWO UIDs (curated based on common business descriptions)
const KEYWORD_TO_HWO_UID: Record<string, string[]> = {
  elektro: ['A-25', 'A-26'],
  heizung: ['A-02', 'A-24'],
  sanitär: ['A-23', 'A-24'],
  dach: ['A-04'],
  maurer: ['A-01'],
  maler: ['A-10'],
  tischler: ['A-27'],
  metall: ['A-13'],
  auto: ['A-20', 'A-15', 'A-17'],
  friseur: ['A-38'],
  bäcker: ['A-30', 'A-31'],
  fleischer: ['A-32'],
  optiker: ['A-33', 'B1-35'],
  fotograf: ['B1-38'],
  drucker: ['B1-40'],
  glaser: ['A-39', 'A-40'],
  sanitärinstallateur: ['A-23', 'A-24'],
};

/**
 * Extract keywords from input signals.
 */
function extractKeywords(input: HwoClassificationInput): Set<string> {
  const keywords = new Set<string>();

  const sources = [input.rawBranche, input.siteTitle, input.companyName, input.domain];

  for (const source of sources) {
    if (!source) continue;
    const normalized = normalize(source);

    // Check for direct aliases
    for (const [alias, keyword] of Object.entries(ALIAS_TO_KEYWORD)) {
      if (normalized.includes(alias)) {
        keywords.add(keyword);
      }
    }

    // Check for exact HWO entry names
    const entries = listHwoEntries({ activeOnly: true });
    for (const entry of entries) {
      if (entry.name) {
        const nameNormalized = normalize(entry.name);
        if (normalized.includes(nameNormalized) || nameNormalized.split(' ').some((part) => normalized.includes(part))) {
          keywords.add(`hwo:${entry.uid}`);
        }
      }
    }
  }

  return keywords;
}

/**
 * Primary classifier: attempts to classify to exact HWO UID.
 */
export function classifyToHwoUid(input: HwoClassificationInput): HwoClassificationResult {
  const keywords = extractKeywords(input);

  // First priority: exact HWO entry match
  for (const keyword of keywords) {
    if (keyword.startsWith('hwo:')) {
      const uid = keyword.slice(4) as HwoUid;
      const entry = getHwoEntry(uid);
      if (entry && entry.status === 'active') {
        return {
          uid,
          confidence: 0.95,
          provenance: 'entry_keyword',
        };
      }
    }
  }

  // Second priority: keyword-based classification
  const candidates: HwoUid[] = [];
  for (const keyword of keywords) {
    if (!keyword.startsWith('hwo:')) {
      const uids = KEYWORD_TO_HWO_UID[keyword];
      if (uids) {
        candidates.push(...(uids as HwoUid[]));
      }
    }
  }

  if (candidates.length > 0) {
    // Take first match (could be improved with scoring)
    return {
      uid: candidates[0]!,
      confidence: 0.75,
      provenance: 'entry_alias',
    };
  }

  return {
    uid: null,
    confidence: null,
    provenance: 'unclassified',
  };
}

// Fallback heuristics for mapping targets when no HWO UID is found
const HEURISTIC_MAPPINGS: Record<string, string> = {
  bau: 'I',
  ausbau: 'II',
  gewerblich: 'III',
  kfz: 'IV',
  lebensmittel: 'V',
  gesundheit: 'VI',
  privat: 'VII',
};

/**
 * Fallback classifier: classify directly to mapping target using heuristics.
 * Only used when primary classification fails.
 */
export function classifyToMappingTarget(
  input: HwoClassificationInput,
  systemId: HwoMappingSystemId
): (HwoMappingTarget & { confidence: number; provenance: HwoProvenance }) | null {
  if (systemId !== 'destatis_group') {
    // Only destatis_group is supported for now
    return null;
  }

  const normalized = normalize(
    [input.rawBranche, input.siteTitle, input.companyName].filter(Boolean).join(' ')
  );

  for (const [keyword, code] of Object.entries(HEURISTIC_MAPPINGS)) {
    if (normalized.includes(keyword)) {
      const groups = [
        { code: 'I', label: 'Bauhauptgewerbe' },
        { code: 'II', label: 'Ausbaugewerbe' },
        { code: 'III', label: 'Handwerke für den gewerblichen Bedarf' },
        { code: 'IV', label: 'Kraftfahrzeuggewerbe' },
        { code: 'V', label: 'Lebensmittelgewerbe' },
        { code: 'VI', label: 'Gesundheitsgewerbe' },
        { code: 'VII', label: 'Handwerke für den privaten Bedarf' },
      ];
      const group = groups.find((g) => g.code === code);
      if (group) {
        return {
          system: systemId,
          code: group.code,
          label: group.label,
          confidence: 0.5,
          provenance: 'heuristic_group_only',
        };
      }
    }
  }

  return null;
}

/**
 * Resolve HWO UID to mapping target.
 */
export function resolveHwoMapping(
  uid: HwoUid,
  systemId: HwoMappingSystemId
): HwoMappingTarget | null {
  return getHwoMappingTarget(uid, systemId);
}
