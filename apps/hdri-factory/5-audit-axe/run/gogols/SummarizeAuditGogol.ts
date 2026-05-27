/*
<MODULE_CONTRACT>
<purpose>Final step in the site-deep-audit pipeline, generating an audit snapshot report.</purpose>
<keywords>audit, summary, provenance, snapshot, axe</keywords>
<responsibilities>
  <item>Aggregate audit run statistics by tool for the current batch.</item>
  <item>Compute SHA-256 hashes of audit and registry DBs for provenance tracking.</item>
  <item>Export a summary JSON and aligned Markdown snapshot report.</item>
</responsibilities>
<non-goals>
  <item>Do not perform Lighthouse or axe audits here.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="byTool">Per-tool audit attempt and success counts for the current batch.</entry>
  <entry key="axeTotals">Summed axe violation counts by impact level.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Add GRACE scaffolding to define module responsibilities.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Add guard requiring cohortId to be resolved before this gogol runs.</item>
  <item>Phase B cleanup: remove cohort references; derive year from sourceToken.</item>
  <item>Remove auditBatchId from SQL queries, JSON output, and markdown report.</item>
  <item>Fix use-after-close bug: move totalSites query before db.close().</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { hashDatabaseFile } from '@org/business-core/cross-db';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openAuditsDb } from '../db/connection.js';
import { getAuditsDbPath, getAuditsDbName } from '../paths.js';

const fileExists = async (p: string): Promise<boolean> => {
  try { await fs.access(p); return true; } catch { return false; }
};

export class SummarizeAuditGogol extends Gogol {
  override readonly id = 'summarize-audit';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, resolvedRegistryDbPath } = ctx.state;

    // Derive year from sourceToken (B.1 cleanup)
    const { year } = parseSourceToken(brief.sourceToken);

    const dbPath = getAuditsDbPath(year);
    const dbName = getAuditsDbName(year);
    const db = openAuditsDb(dbPath);

    type ToolStats = { attempted: number; ok: number };
    const byTool = new Map<string, ToolStats>();
    const rows = db.prepare(`
      SELECT tool, COUNT(*) AS n, SUM(ok) AS ok_n
      FROM audit_runs
      GROUP BY tool
    `).all() as Array<{ tool: string; n: number; ok_n: number | null }>;
    for (const r of rows) byTool.set(r.tool, { attempted: r.n, ok: r.ok_n ?? 0 });

    const axeTotals = db.prepare(`
      SELECT SUM(violations_total) AS total, SUM(critical_count) AS crit,
             SUM(serious_count) AS ser, SUM(moderate_count) AS mod,
             SUM(minor_count) AS minr
      FROM axe_runs
    `).get() as {
      total: number | null; crit: number | null; ser: number | null;
      mod: number | null; minr: number | null;
    };

    // Get total sites audited from database
    const totalSites = (db.prepare(`
      SELECT COUNT(DISTINCT site_id) AS n FROM audit_runs
    `).get() as { n: number }).n;

    db.close();

    console.log(`[summarize-audit] Hashing ${dbName}.db…`);
    const dbSha = await hashDatabaseFile(dbPath);
    const coreSha = (resolvedRegistryDbPath && await fileExists(resolvedRegistryDbPath))
      ? await hashDatabaseFile(resolvedRegistryDbPath)
      : null;

    const doneAt = new Date().toISOString();
    console.log(
      `[summarize-audit] Done. ` +
      `tools=${Array.from(byTool.keys()).join(',')} ` +
      `sha256=${dbSha.slice(0, 12)}…`,
    );

    const snapshot = {
      doneAt,
      auditYear: year,
      totalSites,
      byTool: Object.fromEntries(byTool),
      axeTotals,
      outputs: {
        dbPath,
        dbName: `${dbName}.db`,
        sha256: dbSha,
      },
      provenance: [
        { sourceApp: 'catalog-harvest', dbPath: resolvedRegistryDbPath, sha256: coreSha },
      ],
    };

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'audit-snapshot.json'),
      JSON.stringify(snapshot, null, 2),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'audit-snapshot.md'),
      [
        `# Audit snapshot`,
        ``,
        `**Batch:** audit  `,
        ``,
        `**Audit Year:** ${year}  `,
        `**Total Sites:** ${totalSites}  `,
        `**Completed:** ${doneAt}`,
        ``,
        `## Per-tool counts`,
        ``,
        markdownTable(
          [
            ['Tool', 'Attempted', 'OK'],
            ...Array.from(byTool.entries()).map(([t, s]) => [t, String(s.attempted), String(s.ok)]),
          ],
          { align: ['l', 'r', 'r'] },
        ),
        ``,
        `## axe totals`,
        ``,
        markdownTable(
          [
            ['Impact', 'Count'],
            ['Critical', String(axeTotals.crit ?? 0)],
            ['Serious', String(axeTotals.ser ?? 0)],
            ['Moderate', String(axeTotals.mod ?? 0)],
            ['Minor', String(axeTotals.minr ?? 0)],
            ['**Total**', `**${axeTotals.total ?? 0}**`],
          ],
          { align: ['l', 'r'] },
        ),
        ``,
        `## Provenance`,
        ``,
        markdownTable(
          [
            ['DB', 'SHA-256'],
            [`${dbName}.db`, `\`${dbSha}\``],
            ['registry.db', coreSha ? `\`${coreSha}\`` : '— (not present)'],
          ],
          { align: ['l', 'l'] },
        ),
      ].join('\n'),
    );
  }
}

