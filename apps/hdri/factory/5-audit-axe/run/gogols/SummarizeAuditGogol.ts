/*
<MODULE_CONTRACT>
<purpose>Final step in the axe audit pipeline, generating an audit snapshot report — delegates to shared SummarizeAuditStep base class.</purpose>
<non-goals>
  <item>Do not perform Lighthouse or axe audits here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding to define module responsibilities.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Add guard requiring cohortId to be resolved before this gogol runs.</item>
  <item>Phase B cleanup: remove cohort references; derive year from sourceToken.</item>
  <item>Remove auditBatchId from SQL queries, JSON output, and markdown report.</item>
  <item>Fix use-after-close bug: move totalSites query before db.close().</item>
  <item>Migrate to SummarizeAuditStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated snapshot, hashing, and formatting logic.</item>
  <item>Use generic TStats type parameter to eliminate as-unknown-as double-cast.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: snapshot integrity is verified by SHA-256; never modify a frozen snapshot

import type Database from "better-sqlite3";
import { markdownTable } from "markdown-table";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { SummarizeAuditStep } from "@syrokomskyi/pipeline-steps";
import type { PipelineContext } from "../pipeline/types.js";
import { openAuditsDb } from "../db/connection.js";
import { getAuditsDbPath, getAuditsDbName } from "../paths.js";

type AxeTotals = {
  total: number | null;
  crit: number | null;
  ser: number | null;
  mod: number | null;
  minr: number | null;
};

export class SummarizeAuditGogol extends SummarizeAuditStep<PipelineContext, AxeTotals> {
  override readonly id = "summarize-audit";

  protected override getAuditsDbPath(period: string): string {
    return getAuditsDbPath(period);
  }

  protected override getAuditsDbName(period: string): string {
    return getAuditsDbName(period);
  }

  protected override openAuditsDb(dbPath: string): Database.Database {
    return openAuditsDb(dbPath);
  }

  protected override getPeriod(ctx: PipelineContext): string {
    const { year, quarter } = parseSourceToken(ctx.state.brief.sourceToken);
    return `${year}-q${quarter}`;
  }

  protected override getRegistryDbPath(ctx: PipelineContext): string {
    return ctx.state.resolvedRegistryDbPath;
  }

  protected override queryToolStats(db: Database.Database): AxeTotals {
    return db
      .prepare(
        `
        SELECT SUM(violations_total) AS total, SUM(critical_count) AS crit,
               SUM(serious_count) AS ser, SUM(moderate_count) AS mod,
               SUM(minor_count) AS minr
        FROM axe_runs
      `,
      )
      .get() as AxeTotals;
  }

  protected override getToolStatsSnapshot(stats: AxeTotals): Record<string, unknown> {
    return { axeTotals: stats };
  }

  protected override formatToolStatsMarkdown(stats: AxeTotals): string[] {
    return [
      `## axe totals`,
      ``,
      markdownTable(
        [
          ["Impact", "Count"],
          ["Critical", String(stats.crit ?? 0)],
          ["Serious", String(stats.ser ?? 0)],
          ["Moderate", String(stats.mod ?? 0)],
          ["Minor", String(stats.minr ?? 0)],
          ["**Total**", `**${stats.total ?? 0}**`],
        ],
        { align: ["l", "r"] },
      ),
    ];
  }
}
