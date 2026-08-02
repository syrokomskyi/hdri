/*
<MODULE_CONTRACT>
<purpose>Final step in the lighthouse audit pipeline, generating an audit snapshot report — delegates to shared SummarizeAuditStep base class.</purpose>
<non-goals>
  <item>Do not perform Lighthouse or axe audits here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding to define module responsibilities.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Add guard requiring cohortId to be resolved before this gogol runs.</item>
  <item>Phase B cleanup: derive year from sourceToken and remove cohort references.</item>
  <item>Remove auditBatchId from SQL queries, JSON output, and markdown report.</item>
  <item>Migrate to SummarizeAuditStep base class from @syrokomskyi/pipeline-steps — eliminates duplicated snapshot, hashing, and formatting logic. Fixes use-after-close bug by ensuring all queries run before db.close().</item>
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

type LighthouseAverages = {
  perf: number | null;
  a11y: number | null;
  bp: number | null;
  seo: number | null;
};

export class SummarizeAuditGogol extends SummarizeAuditStep<PipelineContext, LighthouseAverages> {
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

  protected override queryToolStats(db: Database.Database): LighthouseAverages {
    return db
      .prepare(
        `
        SELECT AVG(performance) AS perf, AVG(accessibility) AS a11y,
               AVG(best_practices) AS bp, AVG(seo) AS seo
        FROM lighthouse_runs
      `,
      )
      .get() as LighthouseAverages;
  }

  protected override getToolStatsSnapshot(stats: LighthouseAverages): Record<string, unknown> {
    return { lighthouseAverages: stats };
  }

  protected override formatToolStatsMarkdown(stats: LighthouseAverages): string[] {
    const fmt = (x: number | null) => (x === null ? "—" : x.toFixed(1));
    return [
      `## Lighthouse averages`,
      ``,
      markdownTable(
        [
          ["Metric", "Avg"],
          ["Performance", fmt(stats.perf)],
          ["Accessibility", fmt(stats.a11y)],
          ["Best Practices", fmt(stats.bp)],
          ["SEO", fmt(stats.seo)],
        ],
        { align: ["l", "r"] },
      ),
    ];
  }
}
