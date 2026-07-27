/*
<MODULE_CONTRACT>
<purpose>Final step in the site-liveness pipeline, generating a snapshot summary report.</purpose>
<non-goals>
  <item>Do not perform HTTP liveness checks here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding to define module responsibilities.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed scanYear field.</item>
  <item>Normalise dbPath to relative in liveness-snapshot.json artifact using toRelativePath from @syrokomskyi/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: snapshot integrity is verified by SHA-256; never modify a frozen snapshot

import path from "node:path";
import { markdownTable } from "markdown-table";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { toFactoryRelativePath } from "../config.js";
import { hashDatabaseFile } from "@syrokomskyi/business-core/cross-db";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openLivenessSqlite } from "../db/connection.js";
import { getLivenessDbPath } from "../paths.js";

export class SummarizeLivenessGogol extends Gogol {
  override readonly id = "summarize-liveness";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const db = openLivenessSqlite(year);

    // Stats from liveness_checks
    const totalChecked = (
      db.prepare(`SELECT COUNT(*) AS n FROM liveness_checks`).get() as { n: number }
    ).n;

    const liveCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM liveness_checks WHERE is_live = 1`).get() as {
        n: number;
      }
    ).n;

    const avgLatency = (
      db
        .prepare(
          `SELECT COALESCE(AVG(latency_ms), 0) AS avg FROM liveness_checks WHERE latency_ms IS NOT NULL`,
        )
        .get() as { avg: number }
    ).avg;

    const allTimeSites = (
      db.prepare(`SELECT COUNT(*) AS n FROM liveness_checks`).get() as { n: number }
    ).n;

    db.close();

    // SHA-256 fingerprint of liveness.db
    const livenessDbPath = getLivenessDbPath(year);
    console.log(`[summarize-liveness] Computing SHA-256 of liveness.db…`);
    const sha256 = await hashDatabaseFile(livenessDbPath);
    console.log(`[summarize-liveness] sha256=${sha256}`);

    const liveRate = totalChecked > 0 ? Math.round((liveCount / totalChecked) * 100) : 0;

    console.log(
      `[summarize-liveness] Total: ${totalChecked} checked, ${liveCount} live (${liveRate}%), avg ${Math.round(avgLatency)}ms`,
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    const doneAt = new Date().toISOString();

    const snapshot = {
      doneAt,
      dbPath: toFactoryRelativePath(livenessDbPath),
      sha256,
      totalCheckedThisBatch: totalChecked,
      liveThisBatch: liveCount,
      deadThisBatch: totalChecked - liveCount,
      liveRatePct: liveRate,
      avgLatencyMs: Math.round(avgLatency),
      allTimeChecks: allTimeSites,
    };

    await ctx.writeTextFile(
      path.join(outDir, "liveness-snapshot.json"),
      JSON.stringify(snapshot, null, 2),
    );

    await ctx.writeTextFile(
      path.join(outDir, "liveness-snapshot.md"),
      [
        `# Liveness Snapshot`,
        ``,
        `**Batch ID:** liveness  `,
        `**Completed:** ${doneAt}`,
        ``,
        markdownTable(
          [
            ["Metric", "Value"],
            ["Domains checked", String(totalChecked)],
            ["Live", `${liveCount} (${liveRate}%)`],
            ["Dead / unreachable", String(totalChecked - liveCount)],
            ["Avg latency (ms)", String(Math.round(avgLatency))],
            ["All-time checks in DB", String(allTimeSites)],
            ["liveness.db SHA-256", `\`${sha256}\``],
          ],
          { align: ["l", "r"] },
        ),
        ``,
        `> Downstream pipelines (site-profile, hdri-scoring) should verify the sha256`,
        `> before attaching this liveness.db to ensure data integrity.`,
      ].join("\n"),
    );

    console.log(`[summarize-liveness] Done. Snapshot written to ${outDir}`);
  }
}
