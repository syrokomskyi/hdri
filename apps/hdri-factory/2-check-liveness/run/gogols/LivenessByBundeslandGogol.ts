/*
<MODULE_CONTRACT>
<purpose>Enrich liveness_checks with bundesland from registry.db and produce per-state
breakdown of liveness metrics.</purpose>
<keywords>bundesland, aggregation, liveness, metrics, enrichment</keywords>
<responsibilities>
  <item>Read sites.bundesland from registry.db.</item>
  <item>Enrich liveness_checks rows with bundesland for the current batch.</item>
  <item>Aggregate metrics (checked, live, dead, avg latency) by bundesland.</item>
  <item>Write JSON and Markdown summary artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not modify registry.db.</item>
  <item>Do not re-check liveness.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="LivenessByBundeslandGogol">Aggregates liveness metrics by German state (Bundesland).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Fail fast with a clear error when upstream registry.db is missing, using inline fs.existsSync check in run() (same pattern as 1-register-businesses).</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed scanYear field.</item>
  <item>Update error message to reference 1-register-businesses as the upstream source.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { markdownTable } from 'markdown-table';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openLivenessSqlite, openReadOnlySqlite } from '../db/connection.js';
import { ensureOutputDir } from '@org/pipeline-node/fs';

export class LivenessByBundeslandGogol extends Gogol {
  override readonly id = 'liveness-by-bundesland';

  override readonly guide = {
    title: 'Liveness Metrics by Bundesland',
    purpose: 'Enrich liveness_checks with bundesland from registry.db and produce a per-state breakdown.',
    decisionType: 'auto' as const,
    inputs: ['registry.db — sites.bundesland', 'liveness.db — liveness_checks'],
    outputs: ['liveness-by-bundesland.json', 'liveness-by-bundesland.md'],
    definitionOfDone: [
      'liveness_checks.bundesland populated for current batch',
      'Per-state metrics JSON and Markdown written',
    ],
  };

  override async run(ctx: PipelineContext): Promise<void> {
    const { state } = ctx;
    const { year } = state.brief;
    const registryDbPath = state.resolvedRegistryDbPath;

    if (!fs.existsSync(registryDbPath)) {
      throw new Error(
        `[liveness-by-bundesland] Upstream registry.db not found at ${registryDbPath}. ` +
        `Ensure 1-register-businesses has been run and the file exists.`,
      );
    }

    const coreDb = openReadOnlySqlite(registryDbPath);
    const livenessDb = openLivenessSqlite(year);

    try {
      // 1. Read sites with bundesland from registry.db
      const sites = coreDb.prepare('SELECT id, domain, bundesland FROM sites').all() as Array<{
        id: number;
        domain: string;
        bundesland: string | null;
      }>;

      // Build domain → bundesland lookup
      const domainToBundesland = new Map<string, string | null>();
      for (const site of sites) {
        domainToBundesland.set(site.domain, site.bundesland);
      }

      // 2. Enrich liveness_checks with bundesland
      // Check if bundesland column exists
      const columns = livenessDb.prepare("PRAGMA table_info(liveness_checks)").all() as Array<{ name: string }>;
      const hasBundeslandColumn = columns.some((c) => c.name === 'bundesland');

      if (!hasBundeslandColumn) {
        livenessDb.prepare('ALTER TABLE liveness_checks ADD COLUMN bundesland TEXT').run();
      }

      const updateStmt = livenessDb.prepare(
        'UPDATE liveness_checks SET bundesland = ? WHERE domain = ?',
      );

      for (const [domain, bundesland] of domainToBundesland) {
        updateStmt.run(bundesland ?? null, domain);
      }

      // 3. Aggregate metrics by bundesland
      const rows = livenessDb.prepare(`
        SELECT
          bundesland,
          COUNT(*) as checked,
          SUM(CASE WHEN is_live = 1 THEN 1 ELSE 0 END) as live,
          SUM(CASE WHEN is_live = 0 THEN 1 ELSE 0 END) as dead,
          ROUND(AVG(latency_ms), 2) as avg_latency_ms
        FROM liveness_checks
        GROUP BY bundesland
        ORDER BY checked DESC
      `).all() as Array<{
        bundesland: string | null;
        checked: number;
        live: number;
        dead: number;
        avg_latency_ms: number;
      }>;

      // 4. Write JSON artifact
      const metrics = rows.map((r) => ({
        bundesland: r.bundesland ?? 'Unknown',
        checked: r.checked,
        live: r.live,
        dead: r.dead,
        avgLatencyMs: r.avg_latency_ms,
      }));

      const outputDir = ctx.getGogolOutputDir(this.id);
      await ensureOutputDir(outputDir);

      const jsonPath = path.join(outputDir, 'liveness-by-bundesland.json');
      await fsp.writeFile(jsonPath, JSON.stringify({
        appId: '2-check-liveness',
        year: year,
        generatedAt: new Date().toISOString(),
        metrics,
      }, null, 2));

      // 5. Write Markdown artifact
      const mdLines: string[] = [
        '# Liveness Metrics by Bundesland',
        '',
        `- **Batch:** liveness`,
        `- **Year:** ${year}`,
        `- **Generated:** ${new Date().toISOString()}`,
        '',
      ];

      const tableData = [
        ['Bundesland', 'Checked', 'Live', 'Dead', 'Avg Latency (ms)'],
        ...metrics.map((m) => [
          m.bundesland,
          String(m.checked),
          String(m.live),
          String(m.dead),
          String(m.avgLatencyMs ?? 'N/A'),
        ]),
      ];

      mdLines.push(markdownTable(tableData));
      mdLines.push('');

      const mdPath = path.join(outputDir, 'liveness-by-bundesland.md');
      await fsp.writeFile(mdPath, mdLines.join('\n'));

      console.log(`[liveness-by-bundesland] Wrote ${metrics.length} state(s) to ${jsonPath}`);
    } finally {
      coreDb.close();
      livenessDb.close();
    }
  }
}
