/*
<MODULE_CONTRACT>
<purpose>Backfill the WP10 vault shard manifest for shards that predate it (WP16 finding-2). The Q2
observations shard was written before WriteVaultGogol recorded shards in vault-manifest.json, so the
real vault has parquet on disk but no manifest — which makes verify:shards and replicate:vault no-ops
on it. This tool scans the on-disk shards, recovers each one's (kind, year, runId), counts its rows,
and records it in the manifest (pinned by bytes + sha256). Dry-run by default; idempotent.</purpose>
<non-goals>
  <item>Never writes or mutates a shard; only records what is already on disk into the manifest.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 finding-2: backfill vault-manifest.json for pre-WP10 shards (e.g. Q2 observations).</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import path from "node:path";
import {
  VaultReader,
  buildShardEntry,
  listOnDiskShards,
  readManifest,
  upsertShardEntry,
  writeManifest,
} from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";
import { parseShardPath } from "./vault-manifest-core";

const APPLY = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function countRows(reader: VaultReader, absShard: string): Promise<number> {
  return reader.countRowsInShard(absShard);
}

async function main(): Promise<void> {
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));

  console.log("🗂  Backfill vault shard manifest for pre-WP10 shards (finding-2)");
  console.log(
    APPLY ? "   mode: APPLY (writes vault-manifest.json)" : "   mode: DRY-RUN (no changes)",
  );
  console.log(`   vault: ${vaultDir}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const onDisk = await listOnDiskShards(vaultDir);
  if (onDisk.length === 0) {
    console.log("No *.parquet shards on disk — nothing to backfill.");
    return;
  }

  const manifest = await readManifest(vaultDir);
  const reader = new VaultReader(vaultDir);
  let added = 0;
  let unchanged = 0;
  let mismatched = 0;
  let skipped = 0;

  for (const rel of onDisk) {
    const parsed = parseShardPath(rel);
    if (!parsed) {
      skipped++;
      console.log(`   ? ${rel}  — unrecognized layout, skipped`);
      continue;
    }
    const abs = path.join(vaultDir, rel);
    const rows = await countRows(reader, abs);
    const entry = await buildShardEntry(vaultDir, abs, {
      kind: parsed.kind,
      year: parsed.year,
      runId: parsed.runId,
      rows,
    });

    const existing = manifest.shards.find((s) => s.path === entry.path);
    if (!existing) {
      added++;
      console.log(
        `   + ${rel}  kind=${parsed.kind} year=${parsed.year} rows=${rows} sha256=${entry.sha256.slice(0, 12)}`,
      );
    } else if (existing.sha256 !== entry.sha256) {
      // A recorded, immutable shard must never change bytes. Report loudly; do NOT silently rewrite.
      mismatched++;
      console.log(
        `   ⚠ ${rel}  ALREADY RECORDED with a DIFFERENT sha256 (${existing.sha256.slice(0, 12)} → ${entry.sha256.slice(0, 12)}) — investigate, not overwriting`,
      );
      continue;
    } else {
      unchanged++;
    }
    if (APPLY) upsertShardEntry(manifest, entry);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `   ${added} new, ${unchanged} already recorded, ${mismatched} mismatched, ${skipped} skipped`,
  );
  if (mismatched > 0) process.exitCode = 1;

  if (APPLY && added > 0) {
    await writeManifest(vaultDir, manifest);
    console.log(`✅ Wrote ${manifest.shards.length} shard(s) to vault-manifest.json.`);
    console.log("   Next: pnpm run verify:shards");
  } else if (!APPLY && added > 0) {
    console.log("Dry-run complete. Re-run with --apply to write the manifest.");
  } else {
    console.log("Manifest already covers every recognized shard. Nothing to do.");
  }
}

void main().catch((error: unknown) => {
  console.error("[backfill-vault-manifest] Failed:", error);
  process.exitCode = 1;
});
