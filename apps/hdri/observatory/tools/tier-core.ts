/*
<MODULE_CONTRACT>
<purpose>Hot/cold storage tiering of observations.obs_json (WP14): decide which cold-period
observations can have their bulky signed JSON payload evicted from the live SQLite DB, prove
each candidate is recoverable from the signed Parquet vault first, evict it, and (the reverse
direction) reconstruct obs_json back from the vault via DuckDB when a cold period is needed hot
again. The vault stays the source of truth; obs_json in the DB is a disposable staging copy.</purpose>
<non-goals>
  <item>Never touches signature/signed_at/signing_key_id/collector_id — only obs_json is tiered.</item>
  <item>Never writes the vault; never deletes a shard; never touches non-cold or unrecoverable runs.</item>
  <item>Does not verify ed25519 signatures — that is verify-vault; this proves shard integrity + id coverage.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP14: initial hot/cold obs_json tiering core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import {
  sha256File,
  type VaultManifestData,
  type VaultReader,
} from "@syrokomskyi/observatory-vault";
import { normalizeVaultObservation } from "../run/rebuild/rebuild-core";

/**
 * The published baseline period. Protected from eviction by default because its bytes back the
 * canonical Q2 numbers readers can still fetch; only an explicit opt-in (`includeBaseline`) makes
 * it eligible, and even then only if it passes the recoverability gate like any other run.
 */
export const PUBLISHED_BASELINE_PERIOD = "2026-q2";

/** Total ordering on "YYYY-qN" periods. Returns true when a is strictly older than b. */
export function periodLt(a: string, b: string): boolean {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  return pa.year * 4 + pa.quarter < pb.year * 4 + pb.quarter;
}

export type ColdPolicy = {
  /** Baseline period protected unless includeBaseline is set. Defaults to PUBLISHED_BASELINE_PERIOD. */
  baselinePeriod: string;
  /** Newest period in the DB — always protected as the hot edge. Null → nothing qualifies. */
  latestPeriod: string | null;
  /** Allow the baseline period to be evicted too (still subject to the recoverability gate). */
  includeBaseline: boolean;
  /** Optional operator tightening: only periods strictly older than this are eligible. */
  beforePeriod?: string | null;
};

/**
 * A period is evictable (cold) when it is strictly older than every protected edge:
 *  - the latest period (the hot edge — never tier the newest data),
 *  - the published baseline (unless includeBaseline),
 *  - the operator's --before bound, if given.
 * With no latest period known, nothing is evictable (conservative).
 */
export function isEvictable(period: string, policy: ColdPolicy): boolean {
  if (!policy.latestPeriod) return false;
  if (!periodLt(period, policy.latestPeriod)) return false;
  if (!policy.includeBaseline && !periodLt(period, policy.baselinePeriod)) return false;
  if (policy.beforePeriod && !periodLt(period, policy.beforePeriod)) return false;
  return true;
}

/**
 * Newest period present in the DB, preferring published runs (the reader-facing edge) and
 * falling back to any observation period. Null when the DB has no periods at all.
 */
export function latestPeriodInDb(db: Database.Database): string | null {
  const published = db
    .prepare(
      `SELECT period FROM pipeline_runs WHERE publication_status = 'published' AND period IS NOT NULL`,
    )
    .all() as Array<{ period: string }>;
  const obs = db
    .prepare(`SELECT DISTINCT period FROM observations WHERE period IS NOT NULL`)
    .all() as Array<{ period: string }>;
  const periods = [...published, ...obs].map((r) => r.period).filter(Boolean);
  if (periods.length === 0) return null;
  return periods.reduce((max, p) => (periodLt(max, p) ? p : max));
}

export type CandidateRun = {
  factoryRunId: string;
  period: string;
  year: number;
  /** Observations in this run that still carry obs_json (the eviction targets). */
  obsWithJson: number;
  /** Approximate bytes reclaimable = SUM(LENGTH(obs_json)). */
  jsonBytes: number;
};

/**
 * Groups obs_json-bearing observations by factory run and keeps only the runs whose period the
 * cold policy allows to leave the hot store. Runs whose obs_json is already fully evicted are
 * skipped (nothing to reclaim). Sorted oldest-period first.
 */
export function selectColdCandidates(db: Database.Database, policy: ColdPolicy): CandidateRun[] {
  const rows = db
    .prepare(
      `SELECT factory_run_id AS factoryRunId,
              period,
              COUNT(*)              AS obsWithJson,
              SUM(LENGTH(obs_json)) AS jsonBytes
         FROM observations
        WHERE obs_json IS NOT NULL
          AND factory_run_id IS NOT NULL
          AND period IS NOT NULL
        GROUP BY factory_run_id, period`,
    )
    .all() as Array<{
    factoryRunId: string;
    period: string;
    obsWithJson: number;
    jsonBytes: number | null;
  }>;

  return rows
    .filter((r) => isEvictable(r.period, policy))
    .map((r) => ({
      factoryRunId: r.factoryRunId,
      period: r.period,
      year: parsePeriod(r.period).year,
      obsWithJson: r.obsWithJson,
      jsonBytes: r.jsonBytes ?? 0,
    }))
    .sort((a, b) => (periodLt(a.period, b.period) ? -1 : a.period === b.period ? 0 : 1));
}

export type RecoverabilityCheck = {
  ok: boolean;
  /** Human-readable failure reasons (empty when ok). */
  reasons: string[];
  /** obs_json-bearing observation ids in the DB for this run. */
  dbIdCount: number;
  /** observation ids present in the vault shard for this run. */
  vaultIdCount: number;
  /** DB ids with NO matching vault row — eviction would lose these. */
  missingInVault: string[];
};

/**
 * The safety gate. A run's obs_json may be evicted only if:
 *  1. its observations shard is recorded in the vault manifest,
 *  2. that shard file is present and its bytes+sha256 still match the manifest (integrity), and
 *  3. every DB observation id (with obs_json) for the run is present in the vault shard (coverage).
 * Any failure returns ok=false with reasons; the caller must not evict that run.
 *
 * This proves recoverability without re-canonicalizing: authenticity is verify-vault's job
 * (run it first), and faithful reconstruction is the proven rebuild-from-vault path.
 */
export async function checkRunRecoverable(
  db: Database.Database,
  reader: VaultReader,
  vaultDir: string,
  manifest: VaultManifestData,
  run: CandidateRun,
): Promise<RecoverabilityCheck> {
  const reasons: string[] = [];
  const dbIds = dbObsJsonIds(db, run.factoryRunId);

  const entry = manifest.shards.find(
    (s) => s.kind === "observations" && s.runId === run.factoryRunId && s.year === run.year,
  );

  if (!entry) {
    return {
      ok: false,
      reasons: [`no observations shard for run ${run.factoryRunId} (year ${run.year}) in manifest`],
      dbIdCount: dbIds.length,
      vaultIdCount: 0,
      missingInVault: dbIds,
    };
  }

  // Manifest integrity: file present + bytes/sha256 unchanged.
  const abs = path.join(vaultDir, entry.path);
  try {
    const stat = fs.statSync(abs);
    if (stat.size !== entry.bytes) {
      reasons.push(`shard ${entry.path} size ${stat.size} != manifest ${entry.bytes} (CORRUPTED)`);
    } else if ((await sha256File(abs)) !== entry.sha256) {
      reasons.push(`shard ${entry.path} sha256 drift (CORRUPTED)`);
    }
  } catch {
    reasons.push(`shard ${entry.path} not on disk (MISSING)`);
  }

  // Id coverage: every obs_json-bearing DB id for this run must exist in the vault shard.
  // read_parquet throws when the glob matches nothing (e.g. the shard was deleted) — treat that
  // as zero coverage; the integrity check above has already recorded the MISSING/CORRUPTED reason.
  let vaultIds = new Set<string>();
  try {
    const vaultRows = await reader.getObservationsForRun(run.factoryRunId, run.year);
    vaultIds = new Set(vaultRows.map((r) => String(r.observation_id)));
  } catch (err) {
    if (reasons.length === 0) reasons.push(`cannot read vault shard: ${String(err)}`);
  }

  const missingInVault = dbIds.filter((id) => !vaultIds.has(id));
  if (missingInVault.length > 0) {
    reasons.push(
      `${missingInVault.length}/${dbIds.length} DB observation(s) absent from the vault shard`,
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    dbIdCount: dbIds.length,
    vaultIdCount: vaultIds.size,
    missingInVault,
  };
}

/** obs_json-bearing observation ids in the DB for a run (the eviction target id set). */
export function dbObsJsonIds(db: Database.Database, factoryRunId: string): string[] {
  return (
    db
      .prepare(`SELECT id FROM observations WHERE factory_run_id = ? AND obs_json IS NOT NULL`)
      .all(factoryRunId) as Array<{ id: string }>
  ).map((r) => r.id);
}

/** NULLs obs_json for the given observation ids (batched). Returns rows changed. */
export function evictObsJson(db: Database.Database, ids: string[]): number {
  if (ids.length === 0) return 0;
  const stmt = db.prepare(`UPDATE observations SET obs_json = NULL WHERE id = ?`);
  let changed = 0;
  const tx = db.transaction((batch: string[]) => {
    for (const id of batch) changed += stmt.run(id).changes;
  });
  const CHUNK = 5000;
  for (let i = 0; i < ids.length; i += CHUNK) tx(ids.slice(i, i + CHUNK));
  return changed;
}

/**
 * Reverse path (cold → hot): reconstructs obs_json for every observation of a run from the vault,
 * using the SAME normalize + JSON.stringify that rebuild-from-vault uses (so the regenerated
 * obs_json re-verifies and re-scores identically). Returns observation_id → obs_json string.
 */
export async function reconstructObsJsonFromVault(
  reader: VaultReader,
  year: number,
  factoryRunId: string,
): Promise<Map<string, string>> {
  const rows = await reader.getAllObservations(year);
  const runRows = rows.filter((r) => String(r.crawl_id ?? "") === factoryRunId);

  const out = new Map<string, string>();
  for (const raw of runRows) {
    const { observation } = normalizeVaultObservation(raw);
    out.set(observation.observation_id, JSON.stringify(observation));
  }
  return out;
}

/** Writes reconstructed obs_json back onto rows that are currently NULL. Returns rows changed. */
export function rehydrateObsJson(db: Database.Database, obsJsonById: Map<string, string>): number {
  const stmt = db.prepare(`UPDATE observations SET obs_json = ? WHERE id = ? AND obs_json IS NULL`);
  let changed = 0;
  const tx = db.transaction((entries: Array<[string, string]>) => {
    for (const [id, json] of entries) changed += stmt.run(json, id).changes;
  });
  const entries = [...obsJsonById.entries()];
  const CHUNK = 5000;
  for (let i = 0; i < entries.length; i += CHUNK) tx(entries.slice(i, i + CHUNK));
  return changed;
}
