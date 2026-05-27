/*
<MODULE_CONTRACT>
<purpose>Initialises the pages_YYYY.db SQLite database with schema and metadata.</purpose>
<keywords>database, migration, pages, SQLite, extraction</keywords>
<responsibilities>
  <item>Create the database directory if it does not exist.</item>
  <item>Run DDL migrations via @org/business-core migratePages.</item>
  <item>Stamp schema version and owner metadata via stampPagesMeta.</item>
  <item>Write setup-report.json artifact with table list and schema version.</item>
</responsibilities>
<non-goals>
  <item>Does not perform any HTTP crawling or extraction — that is CrawlGogol and extract gogols' responsibility.</item>
  <item>Does not write to any table other than pages_YYYY.db.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SetupProfileDbGogol.run">Main entry point that creates and migrates the pages database.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: database setup and migration for profile extraction pipeline.</item>
  <item>Add GRACE scaffolding.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Normalise dbPath to relative in db-setup.json artifact using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSourceToken } from '@org/observatory-crypto';
import { toFactoryRelativePath } from '../config.js';
import { migratePages, stampPagesMeta } from '@org/business-core/migrate';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openPagesDb } from '../db/connection.js';
import { getDbDir, getPagesDbPath } from '../paths.js';
import { PAGES_SCHEMA_VERSION, OWNER_APP } from '../constants.js';

export class SetupProfileDbGogol extends Gogol {
  override readonly id = 'setup-profile-db';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, pagesDbName } = ctx.state;
    await fs.mkdir(getDbDir(), { recursive: true });

    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;
    const pagesDbPath = getPagesDbPath(year, half);
    const db = openPagesDb(pagesDbPath);

    console.log(`[setup-profile-db] Initialising: ${pagesDbName}.db`);
    migratePages(db);
    stampPagesMeta(db, OWNER_APP, PAGES_SCHEMA_VERSION);

    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
    ).map((r) => r.name);

    db.close();
    console.log(`[setup-profile-db] Done. ${tables.length} tables. Schema ${PAGES_SCHEMA_VERSION}.`);

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'db-setup.json'),
      JSON.stringify({ dbPath: toFactoryRelativePath(pagesDbPath), pagesDbName, ownerApp: OWNER_APP, schemaVersion: PAGES_SCHEMA_VERSION, tables }, null, 2),
    );
    await ctx.writeTextFile(
      path.join(outDir, 'db-summary.md'),
      [
        `# Profile DB Setup`,
        ``,
        `**DB:** \`${pagesDbName}.db\`  `,
        `**Schema:** ${PAGES_SCHEMA_VERSION}  `,
        `**Owner:** ${OWNER_APP}`,
        ``,
        `## Tables`,
        ...tables.map((t) => `- \`${t}\``),
      ].join('\n'),
    );
  }
}


