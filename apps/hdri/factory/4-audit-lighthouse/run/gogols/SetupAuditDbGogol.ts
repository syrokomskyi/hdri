/*
<MODULE_CONTRACT>
<purpose>Gogol that initialises the Lighthouse audit SQLite database for a given year.</purpose>
<non-goals>
  <item>Does not run any Lighthouse audits themselves.</item>
  <item>Does not seed or import audit data from upstream sources.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
  <item>Replace setupDatabase + writeDbSetupArtifacts two-call pattern with single setupFactoryDb call.</item>
</CHANGE_SUMMARY>
*/
import { parseSourceToken } from "@syrokomskyi/observatory-crypto";
import { migrateLighthouse, stampAuditsMeta } from "@syrokomskyi/business-core/migrate";
import { setupFactoryDb } from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";
import { openAuditsDb } from "../db/connection.js";
import { getDbDir, getAuditsDbName, getAuditsDbPath, getReportsRootDir } from "../paths.js";
import { AUDITS_SCHEMA_VERSION, OWNER_APP } from "../constants.js";

export class SetupAuditDbGogol extends Gogol {
  override readonly id = "setup-audit-db";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;
    const { year } = parseSourceToken(brief.sourceToken);
    const dbName = getAuditsDbName(year);
    const dbPath = getAuditsDbPath(year);

    await setupFactoryDb({
      dbDir: getDbDir(),
      openDb: () => openAuditsDb(dbPath),
      migrate: migrateLighthouse,
      stampMeta: stampAuditsMeta,
      ownerApp: OWNER_APP,
      schemaVersion: AUDITS_SCHEMA_VERSION,
      dbLabel: `${dbName}.db`,
      artifactLabel: "Audit DB (Lighthouse)",
      dbPath: dbPath,
      outputDir: ctx.getGogolOutputDir(this.id),
      writeTextFile: (p, c) => ctx.writeTextFile(p, c),
      extraMkdirs: [getReportsRootDir()],
    });
  }
}
