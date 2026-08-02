/*
<MODULE_CONTRACT>
<purpose>Exports utilities and types for managing and interacting with vault data, including writing, reading, and verifying shard manifests.</purpose>
<non-goals>
  <item>Does not implement the internal logic of vault data manipulation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for vault data management utilities and types.</item>
  <item>Architectural refactoring: added VaultManifest class, VaultManifestData type, DuckDbSession, resolveShardPaths, SHARD_KIND_DIRS, shardKindGlob exports. VaultShardKind now sourced from paths.js.</item>
</CHANGE_SUMMARY>
*/

// Writer
export { VaultWriter } from "./writer.js";
export type { WriteResult, VaultAssetIdentityRecord, VaultAssetStateRecord } from "./writer.js";

// Reader
export { VaultReader } from "./reader.js";

// DuckDB session (pooled)
export { DuckDbSession } from "./duckdb.js";

// Path helpers and shard-kind mapping
export {
  identityGlob,
  identityShardDir,
  identityShardPath,
  lifecycleGlob,
  lifecycleShardDir,
  lifecycleShardPath,
  obsGlob,
  obsShardDir,
  obsShardPath,
  statesGlob,
  statesShardDir,
  statesShardPath,
  resolveShardPaths,
  shardKindDir,
  shardKindGlob,
  SHARD_KIND_DIRS,
  VAULT_ASSET_IDENTITY_DIR,
  VAULT_ASSET_STATES_DIR,
  VAULT_LIFECYCLE_DIR,
  VAULT_OBSERVATIONS_DIR,
} from "./paths.js";
export type { VaultShardKind } from "./paths.js";

// Shard manifest (WP10): authoritative expected-shard list + planned verification
export {
  VAULT_MANIFEST_FILENAME,
  VaultManifest,
  buildShardEntry,
  emptyManifest,
  listOnDiskShards,
  manifestPath,
  readManifest,
  sha256File,
  upsertShardEntry,
  verifyVaultAgainstManifest,
  writeManifest,
} from "./manifest.js";
export type { VaultManifestData, VaultShardEntry, VaultVerifyResult } from "./manifest.js";
