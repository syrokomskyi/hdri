/*
<MODULE_CONTRACT>
  <purpose>Production adapter: persist observations into vault parquet shards, replicate the vault to a second root, and verify the replica against the manifest.</purpose>
  <non-goals><item>Does not rebuild — replication only; independent-rebuild proves reconstruction.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: replication producer — vault write + replica + manifest verify.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  readManifest,
  VaultWriter,
  verifyVaultAgainstManifest,
} from "@syrokomskyi/observatory-vault";
import {
  ackFault,
  appendJsonl,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);
const vaultDir = path.join(stageDir, "vault");
const replicaDir = path.join(stageDir, "replica");

const obsDb = new Database(scratchPath(args.workRoot, "work/translation/observations.sqlite"), {
  readonly: true,
});
const rows = obsDb
  .prepare("SELECT obs_json FROM observations WHERE obs_json IS NOT NULL ORDER BY id")
  .all() as { obs_json: string }[];
obsDb.close();

const year = Number(manifest.period.slice(0, 4));
const writer = new VaultWriter(vaultDir);
const projection = path.join(stageDir, "projection.jsonl");

// Write observations as vault shards in two batches so the vault-write boundary is real.
const midpoint = Math.floor(rows.length / 2);
const shardRows = (slice: { obs_json: string }[]) =>
  slice.map((r) => JSON.parse(r.obs_json) as Record<string, unknown>);

const first = await writer.writeShard("observations", shardRows(rows.slice(0, midpoint)), {
  year,
  runId: `${manifest.runId}-a`,
});
await appendJsonl(projection, { shard: first.shardPath, rows: first.count });
const second = await writer.writeShard("observations", shardRows(rows.slice(midpoint)), {
  year,
  runId: `${manifest.runId}-b`,
});
await appendJsonl(projection, { shard: second.shardPath, rows: second.count });

// Vault committed — the replica-copy boundary is the deterministic failpoint.
if (args.faultBoundary === "replica-copy")
  await ackFault(args, "replica-copy", {
    vaultShards: (await readManifest(vaultDir)).shards.length,
    committedRows: rows.length,
    replicaPending: true,
  });

// Replicate: byte-copy the vault closure (shards + manifest) into a disjoint root.
const copyTree = (src: string, dst: string): void => {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
};
copyTree(vaultDir, replicaDir);

// Verify the replica against the manifest — the real vault verification path.
const replicaManifest = await readManifest(replicaDir);
const result = await verifyVaultAgainstManifest(replicaDir, replicaManifest, {
  strict: true,
});
if (!result.ok)
  throw new Error(
    `REPLICA_VERIFY_FAILED:missing=${result.missing.length},corrupted=${result.corrupted.length},untracked=${result.untracked.length}`,
  );

await writeJsonAtomic(path.join(stageDir, "replication-receipt.json"), {
  schema: "hdri-replication@1",
  stage: args.stage,
  shards: result.checked,
  rows: rows.length,
  replicaOk: result.ok,
  replicatedAt: manifest.frozenTime,
});
