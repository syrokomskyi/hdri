/*
<MODULE_CONTRACT>
<purpose>Enumerates device output folders and filters ignored ones.</purpose>
<non-goals>
  <item>Does not handle device identity validation or environment loading.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from device.ts — device folder enumeration only.</item>
</CHANGE_SUMMARY>
*/

import fsp from "node:fs/promises";
import path from "node:path";

const IGNORED_PREFIX = "-";

/**
 * Returns true when a folder name represents a device whose data should be
 * ignored by downstream pipelines (e.g. "-stale-laptop").
 *
 * Used by 1-register-businesses and a-contract-ontology when walking sibling
 * `.output/` directories to collect data from multiple machines.
 */
export function isIgnoredDeviceFolder(folderName: string): boolean {
  return folderName.startsWith(IGNORED_PREFIX);
}

/**
 * Walks the immediate subdirectories of a parent `.output/` folder, returning
 * one entry per device folder. Folders whose name starts with `-` (ignored)
 * are skipped.
 *
 * Used by 1-register-businesses (over `0-harvest-source/.output/`) and
 * a-contract-ontology (over `0..5/.output/`) to find data from all
 * collaborating machines without enumeration in brief.md.
 */
export async function listDeviceFolders(parentOutputDir: string): Promise<
  {
    deviceId: string;
    path: string;
  }[]
> {
  let entries;
  try {
    entries = await fsp.readdir(parentOutputDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { deviceId: string; path: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = String(e.name);
    if (isIgnoredDeviceFolder(name)) continue;
    out.push({ deviceId: name, path: path.join(parentOutputDir, name) });
  }
  return out;
}
