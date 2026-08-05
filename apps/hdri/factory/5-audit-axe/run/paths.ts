/*
<MODULE_CONTRACT>
<purpose>Path resolution helpers for audit database and report artifact locations.</purpose>
<non-goals>
  <item>Does not perform filesystem I/O or create directories.</item>
  <item>Does not contain pipeline or gogol runtime logic.</item>
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

export const getAuditsDbName = (period: string | number): string => `${AUDITS_DB_PREFIX}-${period}`;

export const getAuditsDbPath = (period: string | number): string =>
  path.join(getDbDir(), `${getAuditsDbName(period)}.db`);

/** Root for content-addressed audit reports (one subdir per tool). */
export const getReportsRootDir = (): string => path.join(outputRootDir, "data", "audit-reports");

export const getReportsToolDir = (tool: string): string => path.join(getReportsRootDir(), tool);

/**
 * CAS path for a given sha256, sharded by the first 2 hex chars:
 *   data/audit-reports/{tool}/{sha[0:2]}/{sha}.json
 */
export const getReportCasPath = (tool: string, sha256: string): string =>
  path.join(getReportsToolDir(tool), sha256.slice(0, 2), `${sha256}.json`);
