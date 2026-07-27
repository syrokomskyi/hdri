/*
<MODULE_CONTRACT>
<purpose>Pure planning for offsite vault replication (WP16 (g)): given the source vault's shard
manifest and what already exists at the destination (by sha256), decide which immutable shards must
be copied and which are already byte-identical. The vault is the append-only source of truth for the
whole index; a second, integrity-verified copy off the primary machine is what makes "we lost the
disk" survivable (LONGEVITY.md doctrine, made operational).</purpose>
<non-goals>
  <item>Does no I/O — the caller reads the manifest, hashes the destination, and performs the copy.</item>
  <item>Never plans a DELETE at the destination — replication is append-only, like the vault.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 (g): pure replication planner for offsite vault mirroring.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import type { VaultShardEntry } from "@syrokomskyi/observatory-vault";

/** What the destination already holds: shard relative path → its on-disk sha256. */
export type ReplicaState = ReadonlyMap<string, string>;

export type ReplicationPlan = {
  /** Shards missing at the destination or whose destination copy has a different sha256. */
  readonly toCopy: VaultShardEntry[];
  /** Shards already present at the destination with a byte-identical sha256. */
  readonly upToDate: VaultShardEntry[];
  /** Total bytes to transfer (sum of toCopy). */
  readonly bytesToCopy: number;
};

/**
 * Plans an idempotent, append-only replication. A shard is copied only when the destination lacks
 * it or holds a different sha256 (a partial/corrupt earlier copy); an identical sha256 is skipped.
 * Because shards are immutable and content-addressed by run_id, a matching sha256 at the same path
 * is proof the destination copy is current — so a re-run transfers only genuinely-new shards.
 */
export function planReplication(
  shards: readonly VaultShardEntry[],
  dest: ReplicaState,
): ReplicationPlan {
  const toCopy: VaultShardEntry[] = [];
  const upToDate: VaultShardEntry[] = [];
  for (const shard of shards) {
    if (dest.get(shard.path) === shard.sha256) upToDate.push(shard);
    else toCopy.push(shard);
  }
  return {
    toCopy,
    upToDate,
    bytesToCopy: toCopy.reduce((sum, s) => sum + s.bytes, 0),
  };
}
