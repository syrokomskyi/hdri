/*
<MODULE_CONTRACT>
<purpose>Facilitates the setup and initialization of the core database for the catalog harvest pipeline.</purpose>
<non-goals>
  <item>Do not perform raw data parsing or transformation.</item>
  <item>Do not manage database connection pooling or orchestration.</item>
  <item>Do not handle user input or external API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill COMPASS scaffolding to enhance code navigation and maintainability.</item>
  <item>Replace hand-rolled markdown table strings with markdownTable() from the markdown-table package.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed harvestYear field.</item>
  <item>Normalise coreDbPath to relative in db-setup.json and db-summary.md artifacts using toRelativePath from @syrokomskyi/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Replace setupDatabase + writeDbSetupArtifacts two-call pattern with single setupFactoryDb call.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { migrateCore, stampCoreMeta } from "@syrokomskyi/business-core/migrate";
import { setupFactoryDb } from "@syrokomskyi/factory-core";
import { toFactoryRelativePath } from "../config.js";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openCoreSqlite } from "../db/connection.js";
import { getDbDir, getCoreDbPath } from "../paths.js";
import { CORE_SCHEMA_VERSION, OWNER_APP } from "../constants.js";

export class SetupCoreDbGogol extends Gogol {
  override readonly id = "setup-core-db";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const coreDbPath = getCoreDbPath(year);

    await setupFactoryDb({
      dbDir: getDbDir(),
      openDb: () => openCoreSqlite(year),
      migrate: migrateCore,
      stampMeta: stampCoreMeta,
      ownerApp: OWNER_APP,
      schemaVersion: CORE_SCHEMA_VERSION,
      dbLabel: path.basename(coreDbPath),
      artifactLabel: "Core DB",
      dbPath: toFactoryRelativePath(coreDbPath),
      outputDir: ctx.getGogolOutputDir(this.id),
      writeTextFile: (p, c) => ctx.writeTextFile(p, c),
    });
  }
}
