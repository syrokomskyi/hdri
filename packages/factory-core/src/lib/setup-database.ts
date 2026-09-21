/*
<MODULE_CONTRACT>
<purpose>Shared database setup helper: mkdir, open, migrate, stamp meta, query tables, close, write artifacts.</purpose>
<non-goals>
  <item>Does not seed data or run business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract shared setupDatabase from 5 copy-pasted Setup*DbGogol modules.</item>
  <item>Add setupFactoryDb — merged lifecycle that does setup + artifact writing in one call.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import type Database from "better-sqlite3";

export type TableInfo = { name: string; rowCount: number };

export type SetupDatabaseOptions = {
  dbDir: string;
  openDb: () => Database.Database;
  migrate: (db: Database.Database) => void;
  stampMeta: (db: Database.Database, ownerApp: string, schemaVersion: string) => void;
  ownerApp: string;
  schemaVersion: string;
  dbLabel: string;
  extraMkdirs?: string[];
};

export type SetupDatabaseResult = {
  tables: TableInfo[];
};

/**
 * Shared database setup: mkdir → open → migrate → stamp meta → query tables → close.
 * Returns table info for the caller to write artifacts.
 */
export async function setupDatabase(opts: SetupDatabaseOptions): Promise<SetupDatabaseResult> {
  await fs.mkdir(opts.dbDir, { recursive: true });
  for (const dir of opts.extraMkdirs ?? []) {
    await fs.mkdir(dir, { recursive: true });
  }

  const db = opts.openDb();
  console.log(`[setup-db] Initialising: ${opts.dbLabel}`);

  opts.migrate(db);
  opts.stampMeta(db, opts.ownerApp, opts.schemaVersion);

  const tables = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as {
      name: string;
    }[]
  ).map((r) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM "${r.name}"`).get() as { n: number };
    return { name: r.name, rowCount: row.n };
  });

  db.close();
  console.log(`[setup-db] Done. ${tables.length} tables. Schema ${opts.schemaVersion}.`);

  return { tables };
}

/**
 * Shared artifact writer for db-setup.json and db-summary.md.
 */
export type WriteDbSetupArtifactsOptions = {
  writeTextFile: (path: string, content: string) => Promise<void>;
  outputDir: string;
  dbPath: string;
  dbLabel: string;
  ownerApp: string;
  schemaVersion: string;
  tables: TableInfo[];
  doneAt: string;
};

export async function writeDbSetupArtifacts(opts: WriteDbSetupArtifactsOptions): Promise<void> {
  await opts.writeTextFile(
    `${opts.outputDir}/db-setup.json`,
    JSON.stringify(
      {
        dbPath: opts.dbPath,
        ownerApp: opts.ownerApp,
        schemaVersion: opts.schemaVersion,
        tables: opts.tables.map(({ name, rowCount }) => ({ name, rowCount })),
        doneAt: opts.doneAt,
      },
      null,
      2,
    ),
  );

  await opts.writeTextFile(
    `${opts.outputDir}/db-summary.md`,
    [
      `# ${opts.dbLabel} Setup`,
      ``,
      `**DB path:** \`${opts.dbPath}\`  `,
      `**Schema version:** ${opts.schemaVersion}  `,
      `**Owner:** ${opts.ownerApp}`,
      ``,
      `## Tables`,
      ...opts.tables.map((t) => `- \`${t.name}\` (${t.rowCount} rows)`),
    ].join("\n"),
  );
}

/**
 * Full database lifecycle: mkdir → open → migrate → stamp → query → close → write artifacts.
 * Combines setupDatabase + writeDbSetupArtifacts into one call.
 */
export type SetupFactoryDbOptions = {
  dbDir: string;
  openDb: () => Database.Database;
  migrate: (db: Database.Database) => void;
  stampMeta: (db: Database.Database, ownerApp: string, schemaVersion: string) => void;
  ownerApp: string;
  schemaVersion: string;
  /** Filename or short identifier used in console logging. */
  dbLabel: string;
  /** Human-readable label for the markdown artifact heading. */
  artifactLabel: string;
  /** Path to the DB file, written to db-setup.json. Pass a relative path for reproducibility. */
  dbPath: string;
  /** Output directory for db-setup.json and db-summary.md. */
  outputDir: string;
  /** File writer function (typically ctx.writeTextFile). */
  writeTextFile: (path: string, content: string) => Promise<void>;
  extraMkdirs?: string[];
};

export async function setupFactoryDb(opts: SetupFactoryDbOptions): Promise<void> {
  const { tables } = await setupDatabase({
    dbDir: opts.dbDir,
    openDb: opts.openDb,
    migrate: opts.migrate,
    stampMeta: opts.stampMeta,
    ownerApp: opts.ownerApp,
    schemaVersion: opts.schemaVersion,
    dbLabel: opts.dbLabel,
    extraMkdirs: opts.extraMkdirs,
  });

  await writeDbSetupArtifacts({
    writeTextFile: opts.writeTextFile,
    outputDir: opts.outputDir,
    dbPath: opts.dbPath,
    dbLabel: opts.artifactLabel,
    ownerApp: opts.ownerApp,
    schemaVersion: opts.schemaVersion,
    tables,
    doneAt: new Date().toISOString(),
  });
}
