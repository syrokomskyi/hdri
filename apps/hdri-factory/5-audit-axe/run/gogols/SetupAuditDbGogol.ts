/*
<MODULE_CONTRACT>
<purpose>Gogol that initialises the axe audit SQLite database for a pipeline run.</purpose>
<keywords>gogol, setup, audit, database, migration, schema</keywords>
<responsibilities>
  <item>Create the database and reports output directories.</item>
  <item>Open or create the audit database file for the given year.</item>
  <item>Run the axe schema migrations against the database.</item>
  <item>Stamp schema metadata (owner app, schema version) into the database.</item>
  <item>Write a db-setup.json and db-summary.md artifact to the step output directory.</item>
</responsibilities>
<non-goals>
  <item>Does not perform any actual audit or analysis work.</item>
  <item>Does not insert or read audit result data.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="SetupAuditDbGogol">Gogol class that sets up the axe audit database for a pipeline run year.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSourceToken } from '@org/observatory-crypto';
import { migrateAxe, stampAuditsMeta } from '@org/business-core/migrate';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';
import { openAuditsDb } from '../db/connection.js';
import { getDbDir, getAuditsDbName, getAuditsDbPath, getReportsRootDir } from '../paths.js';
import { AUDITS_SCHEMA_VERSION, OWNER_APP } from '../constants.js';

export class SetupAuditDbGogol extends Gogol {
  override readonly id = 'setup-audit-db';

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;

    // Derive year from sourceToken (B.1 cleanup)
    const { year } = parseSourceToken(brief.sourceToken);

    await fs.mkdir(getDbDir(), { recursive: true });
    await fs.mkdir(getReportsRootDir(), { recursive: true });

    const dbName = getAuditsDbName(year);
    const dbPath = getAuditsDbPath(year);
    const db = openAuditsDb(dbPath);

    console.log(`[setup-audit-db] Initialising: ${dbName}.db`);
    migrateAxe(db);
    stampAuditsMeta(db, OWNER_APP, AUDITS_SCHEMA_VERSION);

    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
    ).map((r) => r.name);

    db.close();
    console.log(`[setup-audit-db] Done. ${tables.length} tables. Schema ${AUDITS_SCHEMA_VERSION}.`);

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, 'db-setup.json'),
      JSON.stringify({ dbPath, dbName, ownerApp: OWNER_APP, schemaVersion: AUDITS_SCHEMA_VERSION, tables }, null, 2),
    );
    await ctx.writeTextFile(
      path.join(outDir, 'db-summary.md'),
      [
        `# Audit DB Setup`,
        ``,
        `**DB:** \`${dbName}.db\`  `,
        `**Schema:** ${AUDITS_SCHEMA_VERSION}  `,
        `**Owner:** ${OWNER_APP}`,
        ``,
        `## Tables`,
        ...tables.map((t) => `- \`${t}\``),
      ].join('\n'),
    );
  }
}

