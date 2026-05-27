/*
<MODULE_CONTRACT>
<purpose>Write audit reports to content-addressable storage (CAS).</purpose>
<keywords>cas, sha256, json, idempotent</keywords>
<responsibilities>
  <item>Compute SHA-256 hash of report JSON.</item>
  <item>Write report to CAS path {tool}/{sha[0:2]}/{sha}.json.</item>
  <item>Return sha256 and casPath for downstream reference.</item>
</responsibilities>
<non-goals>
  <item>Does not validate report JSON structure.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="writeReportToCas">Writes JSON report to CAS and returns sha256 and path.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getReportCasPath } from '../paths.js';

export const writeReportToCas = async (
  tool: string,
  reportJson: string,
): Promise<{ sha256: string; casPath: string }> => {
  const sha256 = createHash('sha256').update(reportJson).digest('hex');
  const casPath = getReportCasPath(tool, sha256);
  await fs.mkdir(path.dirname(casPath), { recursive: true });
  try {
    await fs.access(casPath);
    // Already present — CAS is immutable by sha.
  } catch {
    await fs.writeFile(casPath, reportJson, 'utf-8');
  }
  return { sha256, casPath };
};

