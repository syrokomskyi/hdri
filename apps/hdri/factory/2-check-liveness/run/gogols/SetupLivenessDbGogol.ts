/*
<MODULE_CONTRACT>
<purpose>Initialises the liveness.db SQLite database with schema and metadata — this module handles setup liveness db operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not perform any HTTP liveness checks — that is CheckLivenessGogol's responsibility.</item>
  <item>Does not write to any table other than liveness.db.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: database setup and migration for liveness pipeline.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Phase B cleanup: derive year from sourceToken instead of removed scanYear field.</item>
  <item>Normalise dbPath to relative in db-setup.json and db-summary.md artifacts using toRelativePath from @syrokomskyi/pipeline-core.</item>
  <item>Switch path normalization to toFactoryRelativePath so artifacts show paths relative to apps/hdri/factory.</item>
  <item>Replace setupDatabase + writeDbSetupArtifacts two-call pattern with single setupFactoryDb call.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/

import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { migrateLiveness, stampLivenessMeta } from "@syrokomskyi/business-core/liveness-migrate";
import { setupFactoryDb } from "@syrokomskyi/factory-core";
import { toFactoryRelativePath } from "../config.js";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openLivenessSqlite } from "../db/connection.js";
import { getDbDir, getLivenessDbPath } from "../paths.js";
import { LIVENESS_SCHEMA_VERSION, OWNER_APP } from "../constants.js";

export class SetupLivenessDbGogol extends Gogol {
  override readonly id = "setup-liveness-db";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const dbPath = getLivenessDbPath(year);

    await setupFactoryDb({
      dbDir: getDbDir(),
      openDb: () => openLivenessSqlite(year),
      migrate: migrateLiveness,
      stampMeta: stampLivenessMeta,
      ownerApp: OWNER_APP,
      schemaVersion: LIVENESS_SCHEMA_VERSION,
      dbLabel: `liveness_${year}.db`,
      artifactLabel: "Liveness DB",
      dbPath: toFactoryRelativePath(dbPath),
      outputDir: ctx.getGogolOutputDir(this.id),
      writeTextFile: (p, c) => ctx.writeTextFile(p, c),
    });
  }
}
