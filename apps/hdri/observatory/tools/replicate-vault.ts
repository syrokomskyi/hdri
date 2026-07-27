/*
<MODULE_CONTRACT>
<purpose>Operator CLI for offsite vault replication (WP16 (g)): mirror the signed, append-only vault
(its manifest-recorded Parquet shards + vault-manifest.json + the WP15 methodology snapshot store) to
a destination directory — a mounted offsite disk, an rclone/S3/R2 mount, or a second machine — then
verify the replica against the manifest. Dry-run by default; idempotent (copies only new/changed
shards by sha256); never deletes at the destination.</purpose>
<non-goals>
  <item>No cloud SDK/credentials — point --dest at a mounted remote (rclone/s3fs) or sync dir.</item>
  <item>Never deletes destination files; never mutates the source vault.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP16 (g): offsite vault replication CLI over the shared replication core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { METHODOLOGY_BLOBS_DIR, METHODOLOGY_INDEX_FILENAME } from "./methodology-snapshot-core";
import {
  VAULT_MANIFEST_FILENAME,
  readManifest,
  sha256File,
  verifyVaultAgainstManifest,
  type VaultManifestData,
} from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";
import { planReplication, type ReplicaState } from "./replication-core";

const APPLY = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

/** sha256 of each source shard already present at the destination (absent → not in the map). */
async function destStateFor(destDir: string, manifest: VaultManifestData): Promise<ReplicaState> {
  const state = new Map<string, string>();
  for (const shard of manifest.shards) {
    const abs = path.join(destDir, shard.path);
    if (fs.existsSync(abs)) state.set(shard.path, await sha256File(abs));
  }
  return state;
}

async function copyFile(srcAbs: string, destAbs: string): Promise<void> {
  await fsp.mkdir(path.dirname(destAbs), { recursive: true });
  await fsp.copyFile(srcAbs, destAbs);
}

/** Recursively mirrors the methodology snapshot store (index + content-addressed blobs). */
async function replicateMethodologyStore(srcVault: string, destVault: string): Promise<number> {
  const srcStore = path.join(srcVault, "methodology");
  if (!fs.existsSync(srcStore)) return 0;
  let copied = 0;
  const walk = async (rel: string): Promise<void> => {
    const srcAbs = path.join(srcStore, rel);
    const entries = await fsp.readdir(srcAbs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(childRel);
      } else if (e.isFile()) {
        const from = path.join(srcStore, childRel);
        const to = path.join(destVault, "methodology", childRel);
        // Content-addressed blobs never change; skip an identical existing file.
        const isBlob = childRel.startsWith(`${METHODOLOGY_BLOBS_DIR}/`);
        if (isBlob && fs.existsSync(to) && (await sha256File(to)) === (await sha256File(from)))
          continue;
        if (childRel === METHODOLOGY_INDEX_FILENAME || !isBlob || !fs.existsSync(to)) {
          await copyFile(from, to);
          copied++;
        }
      }
    }
  };
  await walk("");
  return copied;
}

async function main(): Promise<void> {
  const srcVault = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));
  const destArg = argValue("--dest");

  console.log("🛰  Offsite vault replication (durability)");
  console.log(APPLY ? "   mode: APPLY (copies to --dest)" : "   mode: DRY-RUN (no changes)");
  console.log(`   source vault: ${srcVault}`);
  if (!destArg) {
    console.log(
      "\n   ✗ --dest <dir> is required (a mounted offsite disk, rclone/s3fs mount, or sync dir).",
    );
    process.exitCode = 1;
    return;
  }
  const destVault = path.resolve(destArg);
  console.log(`   destination:  ${destVault}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const manifest = await readManifest(srcVault);
  if (manifest.shards.length === 0) {
    console.log("Source manifest is empty (no shards) — nothing to replicate.");
    return;
  }

  const dest = await destStateFor(destVault, manifest);
  const plan = planReplication(manifest.shards, dest);

  console.log(
    `   shards: ${manifest.shards.length}  ·  up-to-date at dest: ${plan.upToDate.length}  ·  to copy: ${plan.toCopy.length} (${fmtBytes(plan.bytesToCopy)})`,
  );
  for (const s of plan.toCopy.slice(0, 20))
    console.log(`      + ${s.path}  (${fmtBytes(s.bytes)})`);
  if (plan.toCopy.length > 20) console.log(`      … and ${plan.toCopy.length - 20} more`);

  if (!APPLY) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Dry-run complete. Re-run with --apply to copy + verify the replica.");
    return;
  }

  // Copy the to-copy shards, then the manifest + methodology snapshot store.
  await fsp.mkdir(destVault, { recursive: true });
  for (const shard of plan.toCopy) {
    await copyFile(path.join(srcVault, shard.path), path.join(destVault, shard.path));
  }
  await copyFile(
    path.join(srcVault, VAULT_MANIFEST_FILENAME),
    path.join(destVault, VAULT_MANIFEST_FILENAME),
  );
  const methCopied = await replicateMethodologyStore(srcVault, destVault);
  console.log(
    `   ✓ copied ${plan.toCopy.length} shard(s) + manifest + ${methCopied} methodology file(s)`,
  );

  // Post-copy integrity: the replica must satisfy the SAME planned verification as the primary.
  const destManifest = await readManifest(destVault);
  const verify = await verifyVaultAgainstManifest(destVault, destManifest);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (verify.ok) {
    console.log(
      `✅ Replica verified — all ${verify.checked} shard(s) present and intact at ${destVault}.`,
    );
    console.log(
      "   Schedule this + `pnpm run verify:shards` so a lost/rotted shard is caught early.",
    );
  } else {
    process.exitCode = 1;
    console.log(
      `❌ Replica FAILED verification — ${verify.missing.length} missing, ${verify.corrupted.length} corrupted. Re-run --apply.`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[replicate-vault] Failed:", error);
  process.exitCode = 1;
});
