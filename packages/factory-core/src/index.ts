/*
<MODULE_CONTRACT>
<purpose>Exports key components and types for managing and running HDRI factory operations.</purpose>
<non-goals>
  <item>Does not implement the internal logic of HDRI processing.</item>
  <item>Does not handle any user interface elements.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for HDRI factory components and types.</item>
  <item>Remove createHdriFactoryEngine export — collapsed into runHdriFactoryEngine.</item>
  <item>Remove withDb export — dead code, 0 consumers.</item>
  <item>Add factory-utils re-exports (moved from @syrokomskyi/observatory-core).</item>
</CHANGE_SUMMARY>
*/

export { HdriFactoryGogol } from "./lib/factory-gogol.js";
export { runHdriFactoryEngine } from "./lib/run-factory-engine.js";
export { createHdriFactoryContext } from "./lib/create-factory-context.js";
export { setupDatabase, writeDbSetupArtifacts, setupFactoryDb } from "./lib/setup-database.js";
export type {
  TableInfo,
  SetupDatabaseOptions,
  SetupDatabaseResult,
  WriteDbSetupArtifactsOptions,
  SetupFactoryDbOptions,
} from "./lib/setup-database.js";

export type {
  HdriFactoryBriefBase,
  HdriFactoryStateBase,
  HdriFactoryContextExtras,
  HdriFactoryContext,
  HdriFactoryGogolArtifacts,
  HdriFactoryPipelineStep,
  HdriFactoryEngineClients,
} from "./lib/types.js";

export {
  createFactoryRelativePathConverter,
  getFactoryRootDir,
  getFactoryPaths,
  getUpstreamOutputRoot,
} from "./lib/factory-utils.js";

export { loadLiveAuditTargets, upsertAuditRun } from "./lib/audit-targets.js";
export type { AuditTarget, AuditRunRow } from "./lib/audit-targets.js";
