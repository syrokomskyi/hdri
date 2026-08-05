/*
<MODULE_CONTRACT>
<purpose>Defines the sole forward-only, partitioned Factory-to-Observatory emit contract.</purpose>
<non-goals><item>Does not translate, sign or interpret observations.</item></non-goals>
</MODULE_CONTRACT>
*/

export type EmitFormat = "ndjson-partitioned-v1";

export type EmitPartition = Readonly<{
  uri: string;
  row_count: number;
  sha256: string;
}>;

export type EmitManifest = Readonly<{
  schema_version: "3";
  format: EmitFormat;
  app_id: string;
  collector_version: string;
  ruleset_version: string;
  ontology_version: string;
  run_id: string;
  period: string;
  emitted_at: string;
  partition_rows: number;
  observation_count: number;
  observation_partitions: EmitPartition[];
  evidence_count: number;
  evidence_partitions: EmitPartition[];
  evidence_hash: string | null;
  bundle_hash: string | null;
  asset_state_count: number;
  asset_state_partitions: EmitPartition[];
  asset_states_hash: string | null;
}>;

export type EmitBundle = Readonly<{
  manifest: EmitManifest;
  emitDir: string;
}>;
