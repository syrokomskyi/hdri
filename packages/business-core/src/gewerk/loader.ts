/**
 * HWO data loader and cache.
 * Loads master dataset and mapping files from runtime data directory.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
  HwoMasterDataset,
  HwoEntry,
  HwoClassification,
  HwoUid,
  HwoMappingDataset,
  HwoMappingEntry,
  HwoMappingTarget,
  HwoMappingSystemId,
  HwoType,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load JSON data using fs for compatibility
const hwoMasterData = JSON.parse(readFileSync(join(__dirname, 'data/hwo-master.json'), 'utf-8'));
const destatisMappingData = JSON.parse(readFileSync(join(__dirname, 'data/destatis-mapping.json'), 'utf-8'));

// Parse and validate master dataset
function parseMasterDataset(data: unknown): HwoMasterDataset {
  const raw = data as Record<string, unknown>;

  return {
    dataset: {
      id: String((raw.dataset as Record<string, unknown>)?.id ?? ''),
      title: String((raw.dataset as Record<string, unknown>)?.title ?? ''),
      jurisdiction: String((raw.dataset as Record<string, unknown>)?.jurisdiction ?? ''),
      sourceOfTruth: ((raw.dataset as Record<string, unknown>)?.sourceOfTruth as Array<Record<string, unknown>>)?.map(
        (s) => ({
          type: String(s.type) as HwoType,
          title: String(s.title),
          legalBasisUrl: String(s.legalBasisUrl),
        })
      ) ?? [],
      notes: ((raw.dataset as Record<string, unknown>)?.notes as string[]) ?? [],
    },
    classifications: ((raw.classifications as Array<Record<string, unknown>>) ?? []).map((c) => ({
      type: String(c.type) as HwoType,
      anlage: String(c.anlage),
      abschnitt: c.abschnitt ? String(c.abschnitt) : null,
      typeName: String(c.type_name ?? c.typeName ?? ''),
      legalBasisUrl: String(c.legal_basis_url ?? c.legalBasisUrl ?? ''),
      items: ((c.items as Array<Record<string, unknown>>) ?? []).map((item): HwoEntry => ({
        uid: String(item.uid) as HwoUid,
        classificationNo: String(item.classification_no ?? item.classificationNo ?? ''),
        status: (item.status as HwoEntry['status']) ?? 'active',
        officialText: String(item.official_text ?? item.officialText ?? ''),
        name: item.name ? String(item.name) : null,
        type: String(c.type) as HwoType,
        anlage: String(c.anlage),
        abschnitt: c.abschnitt ? String(c.abschnitt) : null,
      })),
    })),
  };
}

// Parse and validate mapping dataset
function parseMappingDataset(data: unknown): HwoMappingDataset {
  const raw = data as Record<string, unknown>;

  return {
    dataset: {
      id: String((raw.dataset as Record<string, unknown>)?.id ?? ''),
      title: String((raw.dataset as Record<string, unknown>)?.title ?? ''),
      sourceDocument: {
        filename: String((((raw.dataset as Record<string, unknown>)?.sourceDocument ?? (raw.dataset as Record<string, unknown>)?.source_document) as Record<string, unknown>)?.filename ?? ''),
        title: String((((raw.dataset as Record<string, unknown>)?.sourceDocument ?? (raw.dataset as Record<string, unknown>)?.source_document) as Record<string, unknown>)?.title ?? ''),
        publisher: String((((raw.dataset as Record<string, unknown>)?.sourceDocument ?? (raw.dataset as Record<string, unknown>)?.source_document) as Record<string, unknown>)?.publisher ?? ''),
      },
      notes: ((raw.dataset as Record<string, unknown>)?.notes as string[]) ?? [],
    },
    targetSystem: {
      id: String(((raw.targetSystem ?? raw.target_system) as Record<string, unknown>)?.id ?? ''),
      groups: ((((raw.targetSystem ?? raw.target_system) as Record<string, unknown>)?.groups as Array<Record<string, unknown>>) ?? []).map((g) => ({
        code: String(g.code),
        label: String(g.label),
      })),
    },
    entries: ((raw.entries as Array<Record<string, unknown>>) ?? []).map((e): HwoMappingEntry => ({
      uid: String(e.uid) as HwoUid,
      target: {
        system: String((e.target as Record<string, unknown>)?.system ?? ''),
        code: String((e.target as Record<string, unknown>)?.code ?? ''),
        label: String((e.target as Record<string, unknown>)?.label ?? ''),
      },
    })),
    qualityChecks: (raw.qualityChecks ?? raw.quality_checks)
      ? {
          mappedEntryCount: Number(((raw.qualityChecks ?? raw.quality_checks) as Record<string, unknown>).mappedEntryCount ?? 0),
          unmappedActiveAB1Uids: (((raw.qualityChecks ?? raw.quality_checks) as Record<string, unknown>).unmappedActiveAB1Uids as string[]) ?? [],
        }
      : undefined,
  };
}

// Load master dataset
export const HWO_MASTER: HwoMasterDataset = parseMasterDataset(hwoMasterData);

// Build entry lookup map
const entryByUid = new Map<HwoUid, HwoEntry>();
for (const classification of HWO_MASTER.classifications) {
  for (const item of classification.items) {
    entryByUid.set(item.uid, item);
  }
}

// Load mappings
const MAPPINGS = new Map<HwoMappingSystemId, HwoMappingDataset>();
MAPPINGS.set('destatis_group', parseMappingDataset(destatisMappingData));

// Build mapping lookup maps
const mappingBySystemAndUid = new Map<HwoMappingSystemId, Map<HwoUid, HwoMappingTarget>>();
for (const [systemId, dataset] of MAPPINGS) {
  const uidMap = new Map<HwoUid, HwoMappingTarget>();
  for (const entry of dataset.entries) {
    uidMap.set(entry.uid, entry.target);
  }
  mappingBySystemAndUid.set(systemId, uidMap);
}

/**
 * Get HWO entry by UID.
 */
export function getHwoEntry(uid: HwoUid): HwoEntry | undefined {
  return entryByUid.get(uid);
}

/**
 * List all HWO entries, optionally filtered.
 */
export function listHwoEntries(options?: {
  activeOnly?: boolean;
  types?: HwoType[];
}): HwoEntry[] {
  const entries: HwoEntry[] = [];

  for (const classification of HWO_MASTER.classifications) {
    if (options?.types && !options.types.includes(classification.type)) {
      continue;
    }
    for (const item of classification.items) {
      if (options?.activeOnly && item.status !== 'active') {
        continue;
      }
      entries.push(item);
    }
  }

  return entries;
}

/**
 * Get HWO classification by type.
 */
export function getHwoClassification(type: HwoType): HwoClassification | undefined {
  return HWO_MASTER.classifications.find((c) => c.type === type);
}

/**
 * List all HWO types (A, B1, B2).
 */
export function listHwoTypes(): HwoType[] {
  return HWO_MASTER.classifications.map((c) => c.type);
}

/**
 * Get mapping target for a given UID and system.
 */
export function getHwoMappingTarget(
  uid: HwoUid,
  systemId: HwoMappingSystemId
): HwoMappingTarget | null {
  const systemMap = mappingBySystemAndUid.get(systemId);
  if (!systemMap) {
    return null;
  }
  return systemMap.get(uid) ?? null;
}

/**
 * Check if a mapping system is available.
 */
export function hasHwoMappingSystem(systemId: HwoMappingSystemId): boolean {
  return MAPPINGS.has(systemId);
}

/**
 * List available mapping systems.
 */
export function listHwoMappingSystems(): HwoMappingSystemId[] {
  return Array.from(MAPPINGS.keys());
}

/**
 * Get mapping dataset by system ID.
 */
export function getHwoMappingDataset(systemId: HwoMappingSystemId): HwoMappingDataset | undefined {
  return MAPPINGS.get(systemId);
}

/**
 * Get all groups for a mapping system.
 */
export function getHwoMappingGroups(
  systemId: HwoMappingSystemId
): Array<{ code: string; label: string }> | undefined {
  return MAPPINGS.get(systemId)?.targetSystem.groups;
}
