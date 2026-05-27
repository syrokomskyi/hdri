/*
<MODULE_CONTRACT>
<purpose>Path resolution helpers for audit database and report artifact locations.</purpose>
<keywords>paths, directories, database, reports, CAS, filesystem</keywords>
<responsibilities>
  <item>Resolve the database directory path under the output root.</item>
  <item>Build the audit database filename and full path from a given year.</item>
  <item>Resolve the root directory for content-addressed audit reports.</item>
  <item>Resolve the per-tool subdirectory under audit reports.</item>
  <item>Compute the sharded CAS path for a given tool and SHA-256 hash.</item>
</responsibilities>
<non-goals>
  <item>Does not perform filesystem I/O or create directories.</item>
  <item>Does not contain pipeline or gogol runtime logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getDbDir">Returns the database directory path under the output root.</entry>
  <entry key="getAuditsDbName">Returns the audit database filename (without extension) for a given year.</entry>
  <entry key="getAuditsDbPath">Returns the full filesystem path to the audit database for a given year.</entry>
  <entry key="getReportsRootDir">Returns the root directory for content-addressed audit reports.</entry>
  <entry key="getReportsToolDir">Returns the per-tool subdirectory under the audit reports root.</entry>
  <entry key="getReportCasPath">Returns the sharded CAS path for a given tool and SHA-256 hash.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from 'node:path';
import { outputRootDir } from './config.js';
import { AUDITS_DB_PREFIX } from './constants.js';

export const getDbDir = (): string => path.join(outputRootDir, 'data', 'db');

export const getAuditsDbName = (year: number): string =>
  `${AUDITS_DB_PREFIX}_${year}`;

export const getAuditsDbPath = (year: number): string =>
  path.join(getDbDir(), `${getAuditsDbName(year)}.db`);

/** Root for content-addressed audit reports (one subdir per tool). */
export const getReportsRootDir = (): string =>
  path.join(outputRootDir, 'data', 'audit-reports');

export const getReportsToolDir = (tool: string): string =>
  path.join(getReportsRootDir(), tool);

/**
 * CAS path for a given sha256, sharded by the first 2 hex chars:
 *   data/audit-reports/{tool}/{sha[0:2]}/{sha}.json
 */
export const getReportCasPath = (tool: string, sha256: string): string =>
  path.join(getReportsToolDir(tool), sha256.slice(0, 2), `${sha256}.json`);

