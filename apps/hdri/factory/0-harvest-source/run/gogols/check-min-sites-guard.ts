/*
<MODULE_CONTRACT>
<purpose>Fail-fast guards that check site counts in core_YYYY.db before sealing a frozen frame.</purpose>
<non-goals>
  <item>Does not check per-batch registration counts — individual batch segments are valid provenance records.</item>
  <item>Does not guard diagnostic runs (maxPages >= 0) — those are intentionally unsealed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from RFC-0068 design for testability.</item>
  <item>RFC-0102: add checkPerSourceYield for per-source yield gating with declared-noise disposition.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import { PipelinePauseError } from "@warpgogol/pipeline-core";

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
    throw new PipelinePauseError(
      [
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
      ].join("\n"),
    );
  }
}

/**
 * RFC-0102: Per-source yield gate.
 *
 * For each source folder discovered in the current batch, checks whether the
 * source produced any accepted seeds. A source with zero accepted seeds that
 * is not declared as "declared-noise" blocks sealing.
 *
 * Source disposition is declared in `brief.md` frontmatter via the
 * `sourceDisposition` map. Sources not listed default to "parsed".
 */
export function checkPerSourceYield(
  db: Database.Database,
  sourceFolders: readonly string[],
  sourceDisposition: Readonly<Record<string, "parsed" | "declared-noise">>,
  maxPages: number,
): void {
  if (maxPages >= 0) return;

  const failingSources: string[] = [];

  for (const sourceFolder of sourceFolders) {
    const disposition = sourceDisposition[sourceFolder] ?? "parsed";
    if (disposition === "declared-noise") continue;

    const result = db
      .prepare(
        `
        SELECT COUNT(*) AS n
        FROM site_source_seeds sss
        JOIN sites s ON sss.site_id = s.id
        WHERE sss.source_path LIKE '%/${sourceFolder}/%'
      `,
      )
      .get() as { n: number };

    if (result.n === 0) {
      failingSources.push(sourceFolder);
    }
  }

  if (failingSources.length > 0) {
    throw new PipelinePauseError(
      [
        "Pipeline paused before sealing — per-source yield gate failed.",
        `Source(s) with zero accepted seeds: ${failingSources.join(", ")}`,
        "These sources are expected to contain businesses but produced no registered sites.",
        "Possible causes:",
        "  1. Parser does not extract website URLs from this source format.",
        "  2. Source files are in an unexpected format or structure.",
        "  3. All domains were filtered as stop domains.",
        "",
        "If the source is intentionally empty (e.g. a noise folder),",
        `add it to sourceDisposition as "declared-noise" in brief.md.`,
        "Do NOT silence individual sources without investigation.",
      ].join("\n"),
    );
  }
}
