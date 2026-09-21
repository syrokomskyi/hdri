/*
<MODULE_CONTRACT>
<purpose>This module provides a registry for HWO mapping systems, allowing retrieval and listing of mapping system definitions and their metadata.</purpose>
<non-goals>
  <item>This module does not handle the creation or modification of mapping system definitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the HWO mapping system registry with basic retrieval and listing functionality.</item>
</CHANGE_SUMMARY>
*/

/**
 * HWO mapping system registry.
 * Defines available mapping systems and their metadata.
 */

import type { HwoMappingSystemDefinition } from "./types.js";

/**
 * Registry of HWO mapping systems.
 * Each system maps HWO UIDs to a target classification (e.g., Destatis groups).
 */
export const HWO_MAPPING_SYSTEMS = {
  destatis_group: {
    id: "destatis_group",
    sourceFile: "destatis-mapping.json",
    targetKind: "group",
    description: "Destatis Gewerbegruppen I-VII (Bauhauptgewerbe, Ausbaugewerbe, etc.)",
  },
} as const satisfies Record<string, HwoMappingSystemDefinition>;

/**
 * Get mapping system definition by ID.
 */
export function getMappingSystemDefinition(
  id: keyof typeof HWO_MAPPING_SYSTEMS,
): HwoMappingSystemDefinition {
  return HWO_MAPPING_SYSTEMS[id];
}

/**
 * List all registered mapping system IDs.
 */
export function listMappingSystemIds(): Array<keyof typeof HWO_MAPPING_SYSTEMS> {
  return Object.keys(HWO_MAPPING_SYSTEMS) as Array<keyof typeof HWO_MAPPING_SYSTEMS>;
}
