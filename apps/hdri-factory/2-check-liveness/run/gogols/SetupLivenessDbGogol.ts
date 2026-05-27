/*
<MODULE_CONTRACT>
<purpose>Initialises the liveness.db SQLite database with schema and metadata.</purpose>
<keywords>database, migration, liveness, SQLite</keywords>
<responsibilities>
  <item>Create the database directory if it does not exist.</item>
  <item>Run DDL migrations via @org/business-core migrateLiveness.</item>
  <item>Stamp schema version and owner metadata via stampLivenessMeta.</item>
  <item>Write setup-report.json artifact with table list and schema version.</item>
</responsibilities>
<non-goals>
  <item>Does not perform any HTTP liveness checks — that is CheckLivenessGogol's responsibility.</item>
  <item>Does not write to any table other than liveness.db.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SetupLivenessDbGogol.run">Main entry point that creates and migrates the liveness database.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: database setup and migration for liveness pipeline.</item>
  <item>Add GRACE scaffolding.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed scanYear field.</item>
  <item>Normalise dbPath to relative in db-setup.json and db-summary.md artifacts using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSourceToken } from '@org/observatory-crypto';
import { toFactoryRelativePath } from '../config.js';
import { migrateLiveness, stampLivenessMeta } from '@org/business-core/liveness-migrate';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openLivenessSqlite } from '../db/connection.js';
import { getDbDir, getLivenessDbPath } from '../paths.js';
import { LIVENESS_SCHEMA_VERSION, OWNER_APP } from '../constants.js';

export class SetupLivenessDbGogol extends Gogol {
  override readonly id = 'setup-liveness-db';

  override async run(ctx: PipelineContext): Promise<void> {
    await fs.mkdir(getDbDir(), { recursive: true });

    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const db = openLivenessSqlite(year);
    console.log(`[setup-liveness-db] Initialising: liveness_${year}.db`);

    migrateLiveness(db);
    stampLivenessMeta(db, OWNER_APP, LIVENESS_SCHEMA_VERSION);

    // Collect table list for the report
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]
    ).map((r) => r.name);

    db.close();

    console.log(`[setup-liveness-db] Done. ${tables.length} tables. Schema ${LIVENESS_SCHEMA_VERSION}.`);

    const outDir = ctx.getGogolOutputDir(this.id);

    await ctx.writeTextFile(
      path.join(outDir, 'db-setup.json'),
      JSON.stringify(
        {
          dbPath: toFactoryRelativePath(getLivenessDbPath(year)),
          ownerApp: OWNER_APP,
          schemaVersion: LIVENESS_SCHEMA_VERSION,
          tables,
        },
        null,
        2,
      ),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'db-summary.md'),
      [
        `# Liveness DB Setup`,
        ``,
        `**DB path:** \`${toFactoryRelativePath(getLivenessDbPath(year))}\``,
        `**Schema version:** ${LIVENESS_SCHEMA_VERSION}`,
        `**Owner app:** ${OWNER_APP}`,
        ``,
        `## Tables`,
        ...tables.map((t) => `- \`${t}\``),
      ].join('\n'),
    );
  }
}

