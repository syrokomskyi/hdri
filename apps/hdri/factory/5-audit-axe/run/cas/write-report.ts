/*
<MODULE_CONTRACT>
<purpose>Write audit reports to content-addressable storage (CAS) — this module handles write-report operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not validate report JSON structure.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getReportCasPath } from "../paths.js";

export const writeReportToCas = async (
  tool: string,
  reportJson: string,
): Promise<{ sha256: string; casPath: string }> => {
  const sha256 = createHash("sha256").update(reportJson).digest("hex");
  const casPath = getReportCasPath(tool, sha256);
  await fs.mkdir(path.dirname(casPath), { recursive: true });
  try {
    await fs.access(casPath);
    // Already present — CAS is immutable by sha.
  } catch {
    await fs.writeFile(casPath, reportJson, "utf-8");
  }
  return { sha256, casPath };
};
