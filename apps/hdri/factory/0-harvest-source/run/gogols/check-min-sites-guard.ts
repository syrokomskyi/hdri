/*
<MODULE_CONTRACT>
<purpose>Fail-fast guard that checks the cumulative site count in core_YYYY.db before sealing a frozen frame.</purpose>
<non-goals>
  <item>Does not check per-batch registration counts — individual batch segments are valid provenance records.</item>
  <item>Does not guard diagnostic runs (maxPages >= 0) — those are intentionally unsealed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from RFC-0068 design for testability.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";

/**
 * Checks the cumulative site count in the `sites` table against `threshold`.
 * Throws `PipelinePauseError` if the count is below the threshold and the
 * pipeline is in sealing mode (`maxPages < 0`).
 *
 * The guard queries `SELECT COUNT(*) FROM sites` from the database — not from
 * in-memory batch reports — because on a partial resume, batch reports only
 * contain stats for files parsed in the current run. The DB holds the
 * cumulative count across all runs, which is the correct source for the
 * sealing decision.
 */
export function checkMinSitesGuard(
  db: Database.Database,
  threshold: number,
  maxPages: number,
): void {
  if (maxPages >= 0 || threshold <= 0) return;

  const siteCount = db.prepare("SELECT COUNT(*) AS n FROM sites").get() as { n: number };

  if (siteCount.n < threshold) {
    throw new PipelinePauseError([
      "Pipeline paused before sealing.",
      `Registered ${siteCount.n} site(s), threshold is ${threshold}.`,
      "All source files produced zero or near-zero registered sites.",
      "Possible causes:",
      "  1. Parser does not extract website URLs from this source format (check JSON-LD vs DOM).",
      "  2. Source files are in an unexpected format or structure.",
      "  3. All domains were filtered as stop domains.",
      "",
      "Fix the parser or source files, then rerun.",
      "Do NOT set minSitesThreshold to 0 to bypass — investigate the root cause.",
    ].join("\n"));
  }
}
