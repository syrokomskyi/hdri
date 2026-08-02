/*
<MODULE_CONTRACT>
<purpose>Maintains an authoritative, append-only list of expected vault shards, verifying their presence and integrity. Exposes a VaultManifest class that deepens the module: callers use load/save/upsert/verify instead of juggling free functions and raw data objects.</purpose>
<non-goals>
  <item>Does not handle the actual writing or deletion of shard files.</item>
  <item>Does not manage shard content or data transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of vault shard manifest management and verification.</item>
  <item>Architectural refactoring: renamed VaultManifest type to VaultManifestData, added VaultManifest class wrapping the data with load/save/upsert/find/verify methods. VaultShardKind moved to paths.ts.</item>
</CHANGE_SUMMARY>
*/

/*
 * Vault shard manifest (WP10 integrity & manageability).
 *
 * The vault is an append-only set of immutable Parquet shards (one per run_id).
 * A shard, once written, never changes. The snapshot manifest (WP6) protects a
 * point-in-time *copy*, and verify-vault (P0.2.10) checks *signatures* on rows
 * that are present — but neither answers the question "is a shard that SHOULD be
 * here missing?". A silently-deleted or never-written shard is invisible to both:
 * the glob just returns fewer rows.
 *
 * This module maintains an authoritative, append-only list of the shards the vault
 * is expected to contain, each pinned by size + sha256. Planned verification then
 * catches a MISSING shard (not only a corrupted one), and flags UNTRACKED shards on
 * disk that were never recorded. The manifest lives next to the shards at
 * `<vaultDir>/vault-manifest.json`.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { VaultShardKind } from "./paths.js";

export const VAULT_MANIFEST_FILENAME = "vault-manifest.json";

// Re-export VaultShardKind from paths.ts for backward compat with callers that import it from manifest.
export type { VaultShardKind } from "./paths.js";

export type VaultShardEntry = {
  /** Path relative to the vault root, forward-slashed (portable across OSes). */
  readonly path: string;
  readonly kind: VaultShardKind;
  readonly year: number;
  /** run_id the shard is named by: factory run for observations, observatory run otherwise. */
  readonly runId: string;
  /** Row count written (informational; the hash is the integrity anchor). */
  readonly rows: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly recordedAt: string;
};

export type VaultManifestData = {
  readonly kind: "observatory-vault-manifest";
  readonly schemaVersion: 1;
  updatedAt: string;
  shards: VaultShardEntry[];
};

export type VaultVerifyResult = {
  ok: boolean;
  /** Number of manifest entries checked. */
  checked: number;
  /** Manifest paths with no file on disk — a shard went missing. */
  missing: string[];
  /** Manifest paths whose on-disk bytes/sha256 no longer match — a shard was corrupted. */
  corrupted: string[];
  /** `*.parquet` files on disk that the manifest does not record. */
  untracked: string[];
};

export function emptyManifest(): VaultManifestData {
  return {
    kind: "observatory-vault-manifest",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    shards: [],
  };
}

export function manifestPath(vaultDir: string): string {
  return path.join(vaultDir, VAULT_MANIFEST_FILENAME);
}

/** Streaming sha256 of a file — bounded memory even for large shards. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Forward-slashed path relative to the vault root (portable manifest keys). */
function relForward(vaultDir: string, absPath: string): string {
  return path.relative(vaultDir, absPath).split(path.sep).join("/");
}

/**
 * Reads the vault manifest, or returns a fresh empty one if none exists yet.
 * A missing manifest is a normal first-write state, not an error.
 */
export async function readManifest(vaultDir: string): Promise<VaultManifestData> {
  try {
    const raw = await fsp.readFile(manifestPath(vaultDir), "utf-8");
    const parsed = JSON.parse(raw) as VaultManifestData;
    if (!Array.isArray(parsed.shards)) return emptyManifest();
    return parsed;
  } catch {
    return emptyManifest();
  }
}

export async function writeManifest(vaultDir: string, manifest: VaultManifestData): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await fsp.mkdir(vaultDir, { recursive: true });
  await fsp.writeFile(manifestPath(vaultDir), JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * Hashes a written shard and returns its manifest entry. `absShardPath` must be a
 * real file under `vaultDir` (call after the Parquet write completes).
 */
export async function buildShardEntry(
  vaultDir: string,
  absShardPath: string,
  meta: { kind: VaultShardKind; year: number; runId: string; rows: number },
): Promise<VaultShardEntry> {
  const stat = await fsp.stat(absShardPath);
  return {
    path: relForward(vaultDir, absShardPath),
    kind: meta.kind,
    year: meta.year,
    runId: meta.runId,
    rows: meta.rows,
    bytes: stat.size,
    sha256: await sha256File(absShardPath),
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Upserts a shard entry by `path` (mutates and returns the manifest). Shards are
 * immutable, so re-recording the same path is normally a no-op re-hash; keying on
 * path keeps the manifest idempotent across pipeline re-runs.
 */
export function upsertShardEntry(
  manifest: VaultManifestData,
  entry: VaultShardEntry,
): VaultManifestData {
  const idx = manifest.shards.findIndex((s) => s.path === entry.path);
  if (idx >= 0) manifest.shards[idx] = entry;
  else manifest.shards.push(entry);
  manifest.shards.sort((a, b) => a.path.localeCompare(b.path));
  return manifest;
}

/** Recursively lists every `*.parquet` file under `vaultDir`, as forward-slashed relative paths. */
export async function listOnDiskShards(vaultDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile() && e.name.endsWith(".parquet")) out.push(relForward(vaultDir, abs));
    }
  };
  await walk(vaultDir);
  return out.sort();
}

/**
 * Verifies the vault on disk against its manifest:
 *  - MISSING:   a recorded shard has no file (the key WP10 guarantee — a vanished shard).
 *  - CORRUPTED: a recorded shard's bytes/sha256 no longer match.
 *  - UNTRACKED: a `*.parquet` on disk the manifest never recorded.
 *
 * `ok` is true only when there are no missing and no corrupted shards. Untracked
 * shards are reported but do not by themselves fail the check (they may be a shard
 * written by a newer, not-yet-recorded step); pass `strict` to fail on them too.
 */
export async function verifyVaultAgainstManifest(
  vaultDir: string,
  manifest: VaultManifestData,
  opts: { strict?: boolean } = {},
): Promise<VaultVerifyResult> {
  const missing: string[] = [];
  const corrupted: string[] = [];

  for (const entry of manifest.shards) {
    const abs = path.join(vaultDir, entry.path);
    try {
      const stat = await fsp.stat(abs);
      if (stat.size !== entry.bytes) {
        corrupted.push(entry.path);
        continue;
      }
      const hash = await sha256File(abs);
      if (hash !== entry.sha256) corrupted.push(entry.path);
    } catch {
      missing.push(entry.path);
    }
  }

  const recorded = new Set(manifest.shards.map((s) => s.path));
  const untracked = (await listOnDiskShards(vaultDir)).filter((p) => !recorded.has(p));

  const ok =
    missing.length === 0 && corrupted.length === 0 && (!opts.strict || untracked.length === 0);
  return { ok, checked: manifest.shards.length, missing, corrupted, untracked };
}

/**
 * Deep module wrapping VaultManifestData with lifecycle methods. Callers use
 * `VaultManifest.load(dir)` / `manifest.save(dir)` / `manifest.upsert(entry)` / `manifest.verify(dir)`
 * instead of juggling free functions and raw data objects. The free functions remain exported
 * for backward compat and internal use.
 */
export class VaultManifest {
  private readonly data: VaultManifestData;

  private constructor(data: VaultManifestData) {
    this.data = data;
  }

  static empty(): VaultManifest {
    return new VaultManifest(emptyManifest());
  }

  static async load(vaultDir: string): Promise<VaultManifest> {
    return new VaultManifest(await readManifest(vaultDir));
  }

  async save(vaultDir: string): Promise<void> {
    await writeManifest(vaultDir, this.data);
  }

  get shards(): VaultShardEntry[] {
    return this.data.shards;
  }

  get updatedAt(): string {
    return this.data.updatedAt;
  }

  upsert(entry: VaultShardEntry): void {
    upsertShardEntry(this.data, entry);
  }

  find(predicate: (e: VaultShardEntry) => boolean): VaultShardEntry | undefined {
    return this.data.shards.find(predicate);
  }

  filter(predicate: (e: VaultShardEntry) => boolean): VaultShardEntry[] {
    return this.data.shards.filter(predicate);
  }

  async verify(vaultDir: string, opts?: { strict?: boolean }): Promise<VaultVerifyResult> {
    return verifyVaultAgainstManifest(vaultDir, this.data, opts);
  }

  /** Returns the raw data object for serialization or backward-compat access. */
  toJSON(): VaultManifestData {
    return this.data;
  }
}
