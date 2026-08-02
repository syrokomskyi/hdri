/*
<MODULE_CONTRACT>
<purpose>This module loads and caches HWO master datasets and mapping files from a runtime data directory, providing functions to access and manipulate this data.</purpose>
<non-goals>
  <item>This module does not handle data persistence or external data fetching.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of HWO data loader and cache with parsing and lookup functionalities.</item>
</CHANGE_SUMMARY>
*/

/**
 * HWO data loader and cache.
 * Loads master dataset and mapping files from runtime data directory.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
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
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load JSON data using fs for compatibility
const hwoMasterData = JSON.parse(readFileSync(join(__dirname, "data/hwo-master.json"), "utf-8"));
const destatisMappingData = JSON.parse(
  readFileSync(join(__dirname, "data/destatis-mapping.json"), "utf-8"),
);

const HwoTypeSchema = z.enum(["A", "B1", "B2"]);

const HwoStatusSchema = z.enum(["active", "repealed_entfaellt", "repealed_weggefallen"]);

const HwoEntrySchema = z.object({
  uid: z.string(),
  classification_no: z.string().optional().or(z.literal(undefined)),
  classificationNo: z.string().optional().or(z.literal(undefined)),
  status: HwoStatusSchema.optional().default("active"),
  official_text: z.string().optional().or(z.literal(undefined)),
  officialText: z.string().optional().or(z.literal(undefined)),
  name: z.string().nullable().optional().default(null),
});

const HwoClassificationSchema = z.object({
  type: HwoTypeSchema,
  anlage: z.string(),
  abschnitt: z.string().nullable().optional().default(null),
  type_name: z.string().optional().or(z.literal(undefined)),
  typeName: z.string().optional().or(z.literal(undefined)),
  legal_basis_url: z.string().optional().or(z.literal(undefined)),
  legalBasisUrl: z.string().optional().or(z.literal(undefined)),
  items: z.array(HwoEntrySchema).optional().default([]),
});

const HwoMasterDatasetSchema = z.object({
  dataset: z.object({
    id: z.string().optional().default(""),
    title: z.string().optional().default(""),
    jurisdiction: z.string().optional().default(""),
    sourceOfTruth: z
      .array(
        z.object({
          type: HwoTypeSchema,
          title: z.string(),
          legalBasisUrl: z.string(),
        }),
      )
      .optional()
      .default([]),
    notes: z.array(z.string()).optional().default([]),
  }),
  classifications: z.array(HwoClassificationSchema).optional().default([]),
});

function parseMasterDataset(data: unknown): HwoMasterDataset {
  const parsed = HwoMasterDatasetSchema.parse(data);
  return {
    dataset: parsed.dataset,
    classifications: parsed.classifications.map((c) => ({
      type: c.type,
      anlage: c.anlage,
      abschnitt: c.abschnitt ?? null,
      typeName: c.type_name ?? c.typeName ?? "",
      legalBasisUrl: c.legal_basis_url ?? c.legalBasisUrl ?? "",
      items: c.items.map(
        (item): HwoEntry => ({
          uid: item.uid as HwoUid,
          classificationNo: item.classification_no ?? item.classificationNo ?? "",
          status: item.status,
          officialText: item.official_text ?? item.officialText ?? "",
          name: item.name ?? null,
          type: c.type,
          anlage: c.anlage,
          abschnitt: c.abschnitt ?? null,
        }),
      ),
    })),
  };
}

const HwoMappingDatasetSchema = z.object({
  dataset: z.object({
    id: z.string().optional().default(""),
    title: z.string().optional().default(""),
    sourceDocument: z
      .object({
        filename: z.string().optional().default(""),
        title: z.string().optional().default(""),
        publisher: z.string().optional().default(""),
      })
      .optional()
      .or(z.literal(undefined)),
    source_document: z
      .object({
        filename: z.string().optional().default(""),
        title: z.string().optional().default(""),
        publisher: z.string().optional().default(""),
      })
      .optional()
      .or(z.literal(undefined)),
    notes: z.array(z.string()).optional().default([]),
  }),
  targetSystem: z
    .object({
      id: z.string().optional().default(""),
      groups: z
        .array(z.object({ code: z.string(), label: z.string() }))
        .optional()
        .default([]),
    })
    .optional()
    .or(z.literal(undefined)),
  target_system: z
    .object({
      id: z.string().optional().default(""),
      groups: z
        .array(z.object({ code: z.string(), label: z.string() }))
        .optional()
        .default([]),
    })
    .optional()
    .or(z.literal(undefined)),
  entries: z
    .array(
      z.object({
        uid: z.string(),
        target: z.object({
          system: z.string().optional().default(""),
          code: z.string().optional().default(""),
          label: z.string().optional().default(""),
        }),
      }),
    )
    .optional()
    .default([]),
  qualityChecks: z
    .object({
      mappedEntryCount: z.number().optional().default(0),
      unmappedActiveAB1Uids: z.array(z.string()).optional().default([]),
    })
    .optional()
    .or(z.literal(undefined)),
  quality_checks: z
    .object({
      mappedEntryCount: z.number().optional().default(0),
      unmappedActiveAB1Uids: z.array(z.string()).optional().default([]),
    })
    .optional()
    .or(z.literal(undefined)),
});

function parseMappingDataset(data: unknown): HwoMappingDataset {
  const parsed = HwoMappingDatasetSchema.parse(data);
  const sourceDoc = parsed.dataset.sourceDocument ??
    parsed.dataset.source_document ?? {
      filename: "",
      title: "",
      publisher: "",
    };
  const targetSys = parsed.targetSystem ?? parsed.target_system ?? { id: "", groups: [] };
  const quality = parsed.qualityChecks ?? parsed.quality_checks;
  return {
    dataset: {
      id: parsed.dataset.id,
      title: parsed.dataset.title,
      sourceDocument: sourceDoc,
      notes: parsed.dataset.notes,
    },
    targetSystem: {
      id: targetSys.id,
      groups: targetSys.groups,
    },
    entries: parsed.entries.map(
      (e): HwoMappingEntry => ({
        uid: e.uid as HwoUid,
        target: {
          system: e.target.system,
          code: e.target.code,
          label: e.target.label,
        },
      }),
    ),
    qualityChecks: quality
      ? {
          mappedEntryCount: quality.mappedEntryCount,
          unmappedActiveAB1Uids: quality.unmappedActiveAB1Uids,
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
MAPPINGS.set("destatis_group", parseMappingDataset(destatisMappingData));

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
export function listHwoEntries(options?: { activeOnly?: boolean; types?: HwoType[] }): HwoEntry[] {
  const entries: HwoEntry[] = [];

  for (const classification of HWO_MASTER.classifications) {
    if (options?.types && !options.types.includes(classification.type)) {
      continue;
    }
    for (const item of classification.items) {
      if (options?.activeOnly && item.status !== "active") {
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
  systemId: HwoMappingSystemId,
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
  systemId: HwoMappingSystemId,
): Array<{ code: string; label: string }> | undefined {
  return MAPPINGS.get(systemId)?.targetSystem.groups;
}
