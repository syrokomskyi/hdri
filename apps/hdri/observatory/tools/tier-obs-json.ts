/*
<MODULE_CONTRACT>
<purpose>Operator CLI for hot/cold obs_json tiering (WP14): reclaim the biggest column in the live
SQLite DB by evicting obs_json for cold periods that are already durably in the signed vault, and
(reverse) rehydrate obs_json back from the vault when a cold period must go hot again. Dry-run by
default; the eviction refuses any run that does not pass the vault recoverability gate.</purpose>
<non-goals>
  <item>Never touches signatures; never writes/deletes vault shards; never evicts an unrecoverable run.</item>
  <item>Does not run verify-vault (signatures) — prints a reminder to run it (+ verify:shards) first.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP14: initial obs_json tiering operator tool (dry-run default, vault-gated eviction, rehydrate).</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { VaultReader, readManifest } from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import {
  PUBLISHED_BASELINE_PERIOD,
  checkRunRecoverable,
  dbObsJsonIds,
  evictObsJson,
  latestPeriodInDb,
  reconstructObsJsonFromVault,
  rehydrateObsJson,
  selectColdCandidates,
  type ColdPolicy,
} from "./tier-core";

const DB_DIR = path.join(outputRootDir, "db");

const APPLY = process.argv.includes("--apply");
const VACUUM = process.argv.includes("--vacuum");
const REHYDRATE = process.argv.includes("--rehydrate");
const INCLUDE_Q2 = process.argv.includes("--include-q2");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

async function findObservatoryDbs(): Promise<string[]> {
  const yearArg = argValue("--year");
  if (yearArg) {
    const p = getObservatoryDbPath(Number(yearArg));
    try {
      await fs.access(p);
      return [p];
    } catch {
      return [];
    }
  }
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(DB_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /^observatory_\d{4}\.db$/i.test(e.name))
    .map((e) => path.join(DB_DIR, e.name))
    .sort();
}

async function processDb(dbPath: string, vaultDir: string): Promise<void> {
  const dbName = path.basename(dbPath);
  const db = new Database(dbPath);
  const reader = new VaultReader(vaultDir);

  try {
    if (REHYDRATE) {
      await rehydrateDb(db, reader, dbName);
      return;
    }

    const latestPeriod = latestPeriodInDb(db);
    const policy: ColdPolicy = {
      baselinePeriod: argValue("--baseline") ?? PUBLISHED_BASELINE_PERIOD,
      latestPeriod,
      includeBaseline: INCLUDE_Q2,
      beforePeriod: argValue("--before") ?? null,
    };

    const candidates = selectColdCandidates(db, policy);
    console.log(
      `  [${dbName}] latest=${latestPeriod ?? "—"}  baseline=${policy.baselinePeriod}` +
        `${policy.includeBaseline ? " (baseline INCLUDED)" : ""}` +
        `${policy.beforePeriod ? `  before=${policy.beforePeriod}` : ""}`,
    );
    if (candidates.length === 0) {
      console.log(`      no cold obs_json to reclaim under this policy`);
      return;
    }

    const manifest = await readManifest(vaultDir);
    let evictable = 0;
    let evictableBytes = 0;
    let evicted = 0;

    for (const run of candidates) {
      const gate = await checkRunRecoverable(db, reader, vaultDir, manifest, run);
      const tag = `${run.period} ${run.factoryRunId.slice(0, 8)}`;
      if (!gate.ok) {
        console.log(
          `      ✗ ${tag}  ${run.obsWithJson} obs, ${fmtBytes(run.jsonBytes)}  BLOCKED: ${gate.reasons.join("; ")}`,
        );
        continue;
      }
      evictable += run.obsWithJson;
      evictableBytes += run.jsonBytes;
      console.log(
        `      ✓ ${tag}  ${run.obsWithJson} obs, ${fmtBytes(run.jsonBytes)} reclaimable` +
          `  (vault has ${gate.vaultIdCount} rows)`,
      );

      if (APPLY) {
        evicted += evictObsJson(db, dbObsJsonIds(db, run.factoryRunId));
      }
    }

    console.log(
      `      → ${evictable} obs / ${fmtBytes(evictableBytes)} recoverable & evictable` +
        (APPLY ? `; evicted ${evicted} row(s)` : ` (dry-run — pass --apply to evict)`),
    );

    if (APPLY && evicted > 0 && VACUUM) {
      console.log(`      · VACUUM ${dbName} … (needs free disk)`);
      db.exec("VACUUM");
      console.log(`      ✓ vacuumed`);
    }
  } finally {
    db.close();
  }
}

async function rehydrateDb(
  db: Database.Database,
  reader: VaultReader,
  dbName: string,
): Promise<void> {
  // Runs that currently have at least one NULL obs_json but do have signed rows in the vault.
  const runs = db
    .prepare(
      `SELECT DISTINCT factory_run_id AS factoryRunId, period
         FROM observations
        WHERE obs_json IS NULL AND factory_run_id IS NOT NULL AND period IS NOT NULL`,
    )
    .all() as Array<{ factoryRunId: string; period: string }>;

  if (runs.length === 0) {
    console.log(`  [${dbName}] no NULL obs_json to rehydrate`);
    return;
  }

  let restored = 0;
  for (const { factoryRunId, period } of runs) {
    const year = Number(period.slice(0, 4));
    const map = await reconstructObsJsonFromVault(reader, year, factoryRunId);
    if (map.size === 0) {
      console.log(
        `      ✗ ${period} ${factoryRunId.slice(0, 8)}  no vault rows — cannot rehydrate`,
      );
      continue;
    }
    if (APPLY) {
      const n = rehydrateObsJson(db, map);
      restored += n;
      console.log(`      ✓ ${period} ${factoryRunId.slice(0, 8)}  rehydrated ${n} row(s)`);
    } else {
      const nullCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM observations WHERE factory_run_id = ? AND obs_json IS NULL`,
          )
          .get(factoryRunId) as { c: number }
      ).c;
      console.log(
        `      · ${period} ${factoryRunId.slice(0, 8)}  ${nullCount} NULL, ${map.size} in vault`,
      );
    }
  }
  console.log(
    APPLY ? `      → rehydrated ${restored} row(s)` : `      (dry-run — pass --apply to rehydrate)`,
  );
}

async function main(): Promise<void> {
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));
  const mode = REHYDRATE ? "REHYDRATE (cold → hot)" : "EVICT (hot → cold)";

  console.log(`📦 Observatory obs_json tiering — ${mode}`);
  console.log(APPLY ? "   mode: APPLY (writes DB)" : "   mode: DRY-RUN (no changes)");
  console.log(`   vault: ${vaultDir}`);
  if (!REHYDRATE) {
    console.log(
      "   ⚠ run `pnpm run verify:shards` and `pnpm run verify:vault` first — eviction assumes signatures verified.",
    );
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const dbPaths = await findObservatoryDbs();
  if (dbPaths.length === 0) {
    console.log(`No observatory_YYYY.db found in ${DB_DIR}`);
    return;
  }
  for (const dbPath of dbPaths) {
    await processDb(dbPath, vaultDir);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    "Note: obs_json is a disposable staging copy; the signed vault remains the source of truth.",
  );
}

void main().catch((error: unknown) => {
  console.error("[tier-obs-json] Failed:", error);
  process.exitCode = 1;
});
