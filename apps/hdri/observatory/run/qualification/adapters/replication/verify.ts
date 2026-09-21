/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for replication: re-verifies both vault and replica against the manifest and cross-checks shard bytes.</purpose>
  <non-goals><item>Does not trust the replica receipt — every shard is re-hashed in both roots.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: replication verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { readManifest, verifyVaultAgainstManifest } from "@syrokomskyi/observatory-vault";
import {
  emitVerification,
  fail,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
  sha256File,
} from "../common.js";

const args = parseAdapterArgs();
const stageDir = scratchPath(args.workRoot, "work/replication");
const vaultDir = path.join(stageDir, "vault");
const replicaDir = path.join(stageDir, "replica");

const manifest = await readManifest(vaultDir);
const replicaManifest = await readManifest(replicaDir);

// Both roots must satisfy the manifest independently.
const vaultResult = await verifyVaultAgainstManifest(vaultDir, manifest, { strict: true });
if (!vaultResult.ok)
  fail(`VAULT_VERIFY_FAILED:${vaultResult.missing.concat(vaultResult.corrupted).join(",")}`);
const replicaResult = await verifyVaultAgainstManifest(replicaDir, replicaManifest, {
  strict: true,
});
if (!replicaResult.ok)
  fail(`REPLICA_VERIFY_FAILED:${replicaResult.missing.concat(replicaResult.corrupted).join(",")}`);

// Manifests must be identical and every replica shard byte-equal to the vault shard.
if (manifest.shards.length !== replicaManifest.shards.length) fail("REPLICA_MANIFEST_MISMATCH");
for (const entry of manifest.shards) {
  // Stream both shards — at 200k each is ~1.8 GB, so readFileSync would hold
  // ~3.6 GB in buffers. sha256 equality is byte-equality for this check.
  const aHash = await sha256File(path.join(vaultDir, entry.path));
  const bHash = await sha256File(path.join(replicaDir, entry.path));
  if (aHash !== bHash) fail(`REPLICA_BYTES_MISMATCH:${entry.path}`);
  if (aHash !== entry.sha256) fail(`VAULT_HASH_MISMATCH:${entry.path}`);
}

// Row count parity with the translation DB.
const obsDb = new Database(scratchPath(args.workRoot, "work/translation/observations.sqlite"), {
  readonly: true,
});
const obsCount = (obsDb.prepare("SELECT COUNT(*) AS n FROM observations").get() as { n: number }).n;
obsDb.close();
const shardRows = manifest.shards.reduce((sum, s) => sum + s.rows, 0);
if (shardRows !== obsCount) fail(`VAULT_ROW_MISMATCH:${shardRows}!=${obsCount}`);

const receipt = JSON.parse(
  fs.readFileSync(path.join(stageDir, "replication-receipt.json"), "utf8"),
) as { schema: string; replicaOk: boolean };
if (receipt.schema !== "hdri-replication@1" || !receipt.replicaOk)
  fail("REPLICATION_RECEIPT_INVALID");

emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/replication/projection.jsonl",
    "work/replication/replication-receipt.json",
    "work/replication/vault/vault-manifest.json",
    "work/replication/replica/vault-manifest.json",
  ]),
);
