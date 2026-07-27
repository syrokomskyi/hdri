/*
<MODULE_CONTRACT>
<purpose>Initialises the pages_YYYY.db SQLite database with schema and metadata — this module handles setup profile db operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform any HTTP crawling or extraction — that is CrawlGogol and extract gogols' responsibility.</item>
  <item>Does not write to any table other than pages_YYYY.db.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: database setup and migration for profile extraction pipeline.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Phase B cleanup: derive year/half from sourceToken instead of removed profileYear/profileHalf fields.</item>
  <item>Normalise dbPath to relative in db-setup.json artifact using toRelativePath from @syrokomskyi/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Replace setupDatabase + writeDbSetupArtifacts two-call pattern with single setupFactoryDb call.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/

import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { migratePages, stampPagesMeta } from "@syrokomskyi/business-core/migrate";
import { setupFactoryDb } from "@syrokomskyi/factory-core";
import { toFactoryRelativePath } from "../config.js";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openPagesDb } from "../db/connection.js";
import { getDbDir, getPagesDbPath } from "../paths.js";
import { PAGES_SCHEMA_VERSION, OWNER_APP } from "../constants.js";

export class SetupProfileDbGogol extends Gogol {
  override readonly id = "setup-profile-db";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, pagesDbName } = ctx.state;
    const { year, quarter } = parseSourceToken(brief.sourceToken);
    const half: 1 | 2 = quarter <= 2 ? 1 : 2;
    const pagesDbPath = getPagesDbPath(year, half);

    await setupFactoryDb({
      dbDir: getDbDir(),
      openDb: () => openPagesDb(pagesDbPath),
      migrate: migratePages,
      stampMeta: stampPagesMeta,
      ownerApp: OWNER_APP,
      schemaVersion: PAGES_SCHEMA_VERSION,
      dbLabel: `${pagesDbName}.db`,
      artifactLabel: "Profile DB",
      dbPath: toFactoryRelativePath(pagesDbPath),
      outputDir: ctx.getGogolOutputDir(this.id),
      writeTextFile: (p, c) => ctx.writeTextFile(p, c),
    });
  }
}
