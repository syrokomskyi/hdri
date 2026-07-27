/*
<MODULE_CONTRACT>
<purpose>Heal the cross-year asset-identity registry (WP12 fix) from the authoritative local
asset_id_map, BEFORE the next quarter runs. The published Q2 baseline minted its canonical ids
into asset_id_map before the vault registry existed, so the registry is EMPTY for those
businesses. This tool writes those pre-registry identities into the append-only vault registry as
one shard (with each identity's true first-seen period), so the vault becomes self-describing for
identity and a later year resolves the same canonical id instead of re-minting. Dry-run by default;
refuses to run if the registry already disagrees with the local map (prior corruption).</purpose>
<non-goals>
  <item>Never mints a new id (every request is already in the local map); never mutates the DB.</item>
  <item>Does not touch published scores — identity ids in asset_id_map are already authoritative.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP12 fix: operator tool to heal the identity registry from asset_id_map before Q3.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type { IdentityRequest } from "@syrokomskyi/observatory-core";
import { VaultReader, VaultWriter, identityShardPath } from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import { planIdentityResolution } from "../run/mint/mint-core";

const APPLY = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type LocalRow = { provisional_id: string; canonical_id: string; domain: string };

async function main(): Promise<void> {
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));
  const dbPath = getObservatoryDbPath(year);

  console.log("🧬 Backfill cross-year identity registry from asset_id_map (WP12 fix)");
  console.log(
    APPLY ? "   mode: APPLY (writes an identity shard)" : "   mode: DRY-RUN (no changes)",
  );
  console.log(`   db: ${path.basename(dbPath)}  vault: ${vaultDir}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const vaultRegistry = await new VaultReader(vaultDir).getIdentityMap();

  const db = new Database(dbPath, { readonly: true });
  let plan: ReturnType<typeof planIdentityResolution>;
  try {
    const localRows = db
      .prepare(`SELECT provisional_id, canonical_id, domain FROM asset_id_map`)
      .all() as LocalRow[];

    if (localRows.length === 0) {
      console.log("asset_id_map is empty — nothing to backfill.");
      return;
    }

    // Guard: a provisional id already in the registry must resolve to the SAME canonical id.
    // A mismatch means the registry was already polluted (e.g. a pre-fix mint) — refuse and
    // report, rather than append a second, divergent record for the same business.
    const conflicts = localRows.filter(
      (r) =>
        vaultRegistry.has(r.provisional_id) &&
        vaultRegistry.get(r.provisional_id) !== r.canonical_id,
    );
    if (conflicts.length > 0) {
      console.log(
        `❌ ${conflicts.length} provisional id(s) already in the registry with a DIFFERENT`,
      );
      console.log(`   canonical id than asset_id_map — the registry is corrupted. Not writing.`);
      for (const c of conflicts.slice(0, 10)) {
        console.log(
          `   ✗ ${c.provisional_id.slice(0, 16)}  registry=${vaultRegistry.get(c.provisional_id)!.slice(0, 8)} != map=${c.canonical_id.slice(0, 8)}`,
        );
      }
      process.exitCode = 1;
      return;
    }

    const localMap = new Map(localRows.map((r) => [r.provisional_id, r.canonical_id]));
    const localDomain = new Map(localRows.map((r) => [r.provisional_id, r.domain]));

    const firstSeenRows = db
      .prepare(
        `SELECT asset_id, MIN(period) AS period FROM asset_states
          WHERE asset_id LIKE 'da-%' AND period IS NOT NULL GROUP BY asset_id`,
      )
      .all() as Array<{ asset_id: string; period: string }>;
    const firstSeenPeriod = new Map(firstSeenRows.map((r) => [r.asset_id, r.period]));

    // Fallback first-seen for an asset with no asset_states period: the earliest period in the DB.
    const earliest =
      (
        db.prepare(`SELECT MIN(period) AS p FROM asset_states WHERE period IS NOT NULL`).get() as {
          p: string | null;
        }
      ).p ?? `${year}-q1`;

    const requests: IdentityRequest[] = localRows.map((r) => ({
      provisionalId: r.provisional_id,
      domain: r.domain,
    }));

    // Reuse the SAME pure decision the live gogol uses: every request is already in the local
    // map, so nothing mints; toRegister is exactly the set of local ids the registry lacks.
    plan = planIdentityResolution({
      requests,
      vaultRegistry,
      localMap,
      localDomain,
      firstSeenPeriod,
      briefPeriod: earliest,
      mintedAt: new Date().toISOString(),
    });
  } finally {
    db.close();
  }

  console.log(
    `   asset_id_map: ${plan.resolved.size}  ·  already in registry: ${vaultRegistry.size}  ·  to heal: ${plan.toRegister.length}`,
  );
  if (plan.minted !== 0) {
    // Should never happen for a backfill (all requests are in the local map).
    console.log(
      `   ⚠ ${plan.minted} id(s) were minted unexpectedly — investigate before applying.`,
    );
    process.exitCode = 1;
    return;
  }
  if (plan.toRegister.length === 0) {
    console.log("Registry already carries every local identity. Nothing to backfill.");
    return;
  }

  const byPeriod = new Map<string, number>();
  for (const r of plan.toRegister)
    byPeriod.set(r.first_seen_period, (byPeriod.get(r.first_seen_period) ?? 0) + 1);
  for (const [p, n] of [...byPeriod.entries()].sort()) console.log(`      first seen ${p}: ${n}`);

  if (!APPLY) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Dry-run complete. Re-run with --apply to write the identity shard.");
    return;
  }

  const shardPath = identityShardPath(vaultDir, year, "backfill");
  try {
    await fsp.access(shardPath);
    console.log(
      `   ✓ identity backfill shard already exists (${path.basename(shardPath)}) — skipping.`,
    );
    return;
  } catch {
    // not present — write it
  }

  const res = await new VaultWriter(vaultDir).writeShard("asset_identity", plan.toRegister, {
    year,
    runId: "backfill",
  });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `Done. Healed ${res.count} identity/-ies into the registry (${path.basename(res.shardPath)}).`,
  );
  console.log("Next: pnpm run verify:shards to confirm the manifest, then it is safe to run Q3.");
}

void main().catch((error: unknown) => {
  console.error("[backfill-identity-registry] Failed:", error);
  process.exitCode = 1;
});
