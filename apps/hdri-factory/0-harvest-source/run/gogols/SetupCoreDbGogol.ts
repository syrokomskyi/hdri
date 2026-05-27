/*
<MODULE_CONTRACT>
<purpose>Facilitates the setup and initialization of the core database for the catalog harvest pipeline.</purpose>
<keywords>database setup, migration, pipeline integration</keywords>
<responsibilities>
  <item>Creates the core database directory and initializes the database schema.</item>
  <item>Generates a summary of database tables and their row counts.</item>
  <item>Writes the database summary to a Markdown file and a JSON configuration file.</item>
  <item>Handles database migration and metadata stamping.</item>
</responsibilities>
<non-goals>
  <item>Do not perform raw data parsing or transformation.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
  <item>Do not handle user input or external API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getTableInfos">Function to retrieve table information from the database.</entry>
  <entry key="renderDbSummaryMd">Function to format the database summary as Markdown.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Backfill GRACE scaffolding to enhance code navigation and maintainability.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed harvestYear field.</item>
  <item>Normalise coreDbPath to relative in db-setup.json and db-summary.md artifacts using toRelativePath from @org/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri-factory.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { markdownTable } from 'markdown-table';
import { parseSourceToken } from '@org/observatory-crypto';
import { toFactoryRelativePath } from '../config.js';
import { migrateCore, stampCoreMeta } from '@org/business-core/migrate';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openCoreSqlite } from '../db/connection.js';
import { getDbDir, getCoreDbPath } from '../paths.js';
import { CORE_SCHEMA_VERSION, OWNER_APP, PIPELINE_VER } from '../constants.js';

type TableInfo = { name: string; sql: string; rowCount: number };

const getTableInfos = (db: Database.Database): TableInfo[] => {
  const tables = db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  ).all() as { name: string; sql: string }[];

  return tables.map(({ name, sql }) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number };
    return { name, sql, rowCount: row.n };
  });
};

const renderDbSummaryMd = (
  coreDbPath: string,
  tables: TableInfo[],
  pipelineVer: string,
  schemaVersion: string,
  doneAt: string,
): string =>
  [
    `# Core DB Setup — catalog-harvest`,
    ``,
    `**Pipeline version:** ${pipelineVer}  `,
    `**Schema version:** ${schemaVersion}  `,
    `**Initialised at:** ${doneAt}`,
    ``,
    `## core.db`,
    ``,
    `Path: \`${coreDbPath}\``,
    ``,
    markdownTable(
      [['Table', 'Rows'], ...tables.map((t) => [t.name, String(t.rowCount)])],
      { align: ['l', 'r'] }
    ),
  ].join('\n');

export class SetupCoreDbGogol extends Gogol {
  override readonly id = 'setup-core-db';

  override async run(ctx: PipelineContext): Promise<void> {
    const dbDir = getDbDir();
    await fs.mkdir(dbDir, { recursive: true });

    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const coreDbPath = getCoreDbPath(year);
    console.log(`[setup-core-db] Initialising: ${path.basename(coreDbPath)}`);

    const db = openCoreSqlite(year);
    migrateCore(db);
    stampCoreMeta(db, OWNER_APP, CORE_SCHEMA_VERSION);
    const tables = getTableInfos(db);
    db.close();

    const doneAt = new Date().toISOString();
    const outDir = ctx.getGogolOutputDir(this.id);

    await ctx.writeTextFile(
      path.join(outDir, 'db-summary.md'),
      renderDbSummaryMd(toFactoryRelativePath(coreDbPath), tables, PIPELINE_VER, CORE_SCHEMA_VERSION, doneAt),
    );

    await ctx.writeTextFile(
      path.join(outDir, 'db-setup.json'),
      JSON.stringify(
        {
          coreDb: toFactoryRelativePath(coreDbPath),
          pipelineVer: PIPELINE_VER,
          schemaVersion: CORE_SCHEMA_VERSION,
          ownerApp: OWNER_APP,
          tables: tables.map(({ name, rowCount }) => ({ name, rowCount })),
          doneAt,
        },
        null,
        2,
      ),
    );

    console.log(
      `[setup-core-db] Done. ${tables.length} tables. Schema ${CORE_SCHEMA_VERSION}.`,
    );
  }
}

