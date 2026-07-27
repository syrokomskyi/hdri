/*
<MODULE_CONTRACT>
<purpose>Path resolution helpers for audit database and report artifact directories.</purpose>
<non-goals>
  <item>Does not perform any filesystem I/O or directory creation.</item>
  <item>Does not handle any paths outside the audit app output tree.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import { outputRootDir } from "./config.js";
import { AUDITS_DB_PREFIX } from "./constants.js";

export const getDbDir = (): string => path.join(outputRootDir, "data", "db");

export const getAuditsDbName = (year: number): string => `${AUDITS_DB_PREFIX}_${year}`;

export const getAuditsDbPath = (year: number): string =>
  path.join(getDbDir(), `${getAuditsDbName(year)}.db`);

/** Root for content-addressed audit reports (one subdir per tool). */
export const getReportsRootDir = (): string => path.join(outputRootDir, "data", "audit-reports");

export const getReportsToolDir = (tool: string): string => path.join(getReportsRootDir(), tool);

/**
 * CAS path for a given sha256, sharded by the first 2 hex chars:
 *   data/audit-reports/{tool}/{sha[0:2]}/{sha}.json
 */
export const getReportCasPath = (tool: string, sha256: string): string =>
  path.join(getReportsToolDir(tool), sha256.slice(0, 2), `${sha256}.json`);
