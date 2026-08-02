/*
<MODULE_CONTRACT>
<purpose>CLI: planned verification of the vault against its shard manifest (WP10) — catches a
MISSING shard, not only a corrupted one.</purpose>
<non-goals>
  <item>Does not verify ed25519 signatures — use verify-vault for that (complementary check).</item>
  <item>Does not write or repair the vault — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP10: planned vault verification against an authoritative shard manifest.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import path from "node:path";
import { readManifest, verifyVaultAgainstManifest } from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));

  console.log("🔎 Vault shard manifest verification (WP10)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   vault: ${vaultDir}`);

  const manifest = await readManifest(vaultDir);
  if (manifest.shards.length === 0) {
    console.log("   manifest: empty (no shards recorded yet) — nothing to verify.");
    return;
  }

  const result = await verifyVaultAgainstManifest(vaultDir, manifest, { strict });

  console.log(`   recorded shards: ${manifest.shards.length}`);
  if (result.missing.length) {
    console.log(`\n❌ MISSING (${result.missing.length}) — a recorded shard has vanished:`);
    for (const p of result.missing) console.log(`     ${p}`);
  }
  if (result.corrupted.length) {
    console.log(`\n❌ CORRUPTED (${result.corrupted.length}) — bytes/sha256 drifted:`);
    for (const p of result.corrupted) console.log(`     ${p}`);
  }
  if (result.untracked.length) {
    const icon = strict ? "❌" : "⚠️ ";
    console.log(`\n${icon} UNTRACKED (${result.untracked.length}) — on disk, not in the manifest:`);
    for (const p of result.untracked) console.log(`     ${p}`);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (result.ok) {
    console.log(`✅ PASS — all ${result.checked} recorded shards present and intact.`);
  } else {
    process.exitCode = 1;
    console.log(
      `FAIL — ${result.missing.length} missing, ${result.corrupted.length} corrupted` +
        (strict ? `, ${result.untracked.length} untracked` : "") +
        ". Restore from a snapshot or rebuild before publishing.",
    );
  }
}

void main().catch((error: unknown) => {
  console.error("[verify-vault-shards] Failed:", error);
  process.exitCode = 1;
});
