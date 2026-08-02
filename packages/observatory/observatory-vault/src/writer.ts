/*
<MODULE_CONTRACT>
<purpose>Manages immutable vault shards by appending signed observations, asset states, identities, and lifecycle events. Provides a unified writeShard method that atomically writes a Parquet shard AND records it in the vault manifest, eliminating the caller-side manifest invariant.</purpose>
<non-goals>
  <item>Does not modify or delete existing shards.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of vault shard management with append-only operations.</item>
  <item>Architectural refactoring: collapsed 4 shallow write methods into a single writeShard, absorbed manifest recording so every write atomically records its shard entry.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs";
import fsp from "node:fs/promises";
import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { writeParquet } from "./duckdb.js";
import { resolveShardPaths, type VaultShardKind } from "./paths.js";
import { buildShardEntry, VaultManifest, type VaultShardEntry } from "./manifest.js";

export type WriteResult = {
  readonly shardPath: string;
  readonly count: number;
  /** Manifest entry for the written shard, or null when rows.length === 0. */
  readonly shardEntry: VaultShardEntry | null;
};

/**
 * Immutability guard at the write boundary. A vault shard is append-only ground truth:
 * once written it must never be rewritten in place (LONGEVITY.md — "Never edit a
 * published observation, score, or shard in place"). Callers already pre-check existence
 * and skip, but the writer refuses to overwrite regardless, so the invariant does not
 * depend on caller discipline. Corrupting an already-written shard is caught by the
 * manifest sha256; this is the cheaper, mechanical defence against an *accidental*
 * overwrite before the fact.
 */
function assertNotOverwriting(shardPath: string): void {
  if (fs.existsSync(shardPath)) {
    throw new Error(
      `Refusing to overwrite an immutable vault shard: ${shardPath}. ` +
        `Shards are append-only — correct forward with a new run, never rewrite.`,
    );
  }
}

/**
 * Marks a freshly-written shard read-only so a stray edit by an operator or a weaker
 * agent working in the repo fails loudly at the filesystem instead of silently mutating
 * ground truth (detected only later by `verify:shards`). `chmod(0o444)` clears the write
 * bit on POSIX and sets the read-only attribute on Windows. Best-effort: a filesystem
 * that cannot honour it (e.g. some network mounts) must not fail the write — the sha256
 * manifest remains the authoritative integrity check either way.
 */
async function markReadonly(shardPath: string): Promise<void> {
  try {
    await fsp.chmod(shardPath, 0o444);
  } catch {
    // Non-fatal: integrity still guaranteed by the manifest hash + ed25519 signatures.
  }
}

/**
 * One row of the cross-year, append-only identity registry: the deterministic
 * provisional id (`da-…`, a stable hash of the domain) mapped to the canonical id
 * minted for it exactly once, ever. Because the provisional id is stable across
 * years, resolving against the accumulated registry keeps a business's canonical id
 * constant from the year it is first seen onward.
 */
export type VaultAssetIdentityRecord = {
  readonly provisional_id: string;
  readonly canonical_id: string;
  readonly domain: string;
  /** Period in which this identity was first minted (e.g. "2026-q3"). */
  readonly first_seen_period: string;
  readonly minted_at: string;
};

/**
 * Self-contained asset-state payload stored in the vault: the emit-bundle
 * {@link AssetStateRecord} plus the billing `period` it belongs to. Carrying the
 * period (which the emit-bundle keeps only in its manifest) is what lets a quarter's
 * asset_states be rebuilt from the vault alone, with no access to the original bundle.
 */
export type VaultAssetStateRecord = AssetStateRecord & { readonly period: string };

/**
 * Appends signed observations to the vault as a new Parquet shard.
 * Each call produces exactly one shard file named by run_id.
 * Readers query all shards via glob pattern — no shard merging needed.
 *
 * The unified write method: writes a Parquet shard for any vault stream kind,
 * marks it read-only, and atomically records it in the vault manifest. This
 * eliminates the caller-side invariant where a shard could exist on disk but
 * be missing from the manifest.
 */
export class VaultWriter {
  constructor(private readonly vaultDir: string) {}

  /**
   * Writes `rows` as a new Parquet shard under the given `kind`/`year`/`runId` path,
   * marks it read-only, and records the shard entry in the vault manifest.
   * Returns `{ shardPath: "", count: 0, shardEntry: null }` when rows is empty.
   */
  async writeShard(
    kind: VaultShardKind,
    rows: readonly object[],
    meta: { year: number; runId: string },
  ): Promise<WriteResult> {
    if (rows.length === 0) {
      return { shardPath: "", count: 0, shardEntry: null };
    }

    const { shardDir, shardPath } = resolveShardPaths(this.vaultDir, kind, meta.year, meta.runId);
    assertNotOverwriting(shardPath);
    await fsp.mkdir(shardDir, { recursive: true });
    await writeParquet(rows as object[], shardPath);
    await markReadonly(shardPath);

    const entry = await buildShardEntry(this.vaultDir, shardPath, {
      kind,
      year: meta.year,
      runId: meta.runId,
      rows: rows.length,
    });
    const manifest = await VaultManifest.load(this.vaultDir);
    manifest.upsert(entry);
    await manifest.save(this.vaultDir);

    return { shardPath, count: rows.length, shardEntry: entry };
  }

  /**
   * Records an already-existing shard in the vault manifest without writing a new file.
   * Use for shards that were skipped (already on disk) but still need manifest recording.
   */
  async recordShard(
    kind: VaultShardKind,
    shardPath: string,
    meta: { year: number; runId: string; rows: number },
  ): Promise<VaultShardEntry> {
    const entry = await buildShardEntry(this.vaultDir, shardPath, {
      kind,
      year: meta.year,
      runId: meta.runId,
      rows: meta.rows,
    });
    const manifest = await VaultManifest.load(this.vaultDir);
    manifest.upsert(entry);
    await manifest.save(this.vaultDir);
    return entry;
  }
}
