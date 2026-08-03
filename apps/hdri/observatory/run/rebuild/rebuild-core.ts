/*
<MODULE_CONTRACT>
<purpose>Pure, testable core for rebuild-from-vault (WP7): reconstruct a fresh observatory DB
from the vault's signed Parquet shards, faithfully enough to re-derive identical scores.
Holds both directions of the vault asset-state contract so "what we store" and "what we
rebuild from" stay symmetric.</purpose>
<non-goals>
  <item>Does not read the vault or open DBs — callers (tool/test) own I/O and connection lifecycle.</item>
  <item>Does not score — that is score-core; the rebuild tool re-scores through the identical path.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP7: initial rebuild-from-vault core + additive self-contained asset_states in the vault.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import type Database from "better-sqlite3";
import type {
  AssetStateMapping,
  AssetStateRecord,
  Observation,
} from "@syrokomskyi/observatory-core";
import type { VaultAssetStateRecord } from "@syrokomskyi/observatory-vault";
import type { AssetStateInput } from "../db/sync-writers";

// ── Coercion: DuckDB read-back gives Date for TIMESTAMP and may give bigint for ──
//    integer-typed columns. Coerce back to the JS shapes the DB/JSON expect.

const toIso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

const toNum = (v: unknown): number | null =>
  v == null ? null : typeof v === "bigint" ? Number(v) : (v as number);

const toStr = (v: unknown): string | null => (v == null ? null : String(v));

const toBool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));

function normalizeMappings(raw: unknown): AssetStateMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const o = m as Record<string, unknown>;
    return {
      mapping_system: String(o.mapping_system),
      target_code: String(o.target_code),
      target_label: o.target_label == null ? null : String(o.target_label),
      source: String(o.source),
    };
  });
}

// ── Asset states: DB ⇄ vault ────────────────────────────────────────────────

type AssetStateDbRow = {
  asset_id: string;
  domain: string;
  gewerk_group: string | null;
  hwo_uid: string | null;
  hwo_provenance: string | null;
  bundesland: string | null;
  gemeinde: string | null;
  period: string | null;
};

type MappingDbRow = {
  asset_id: string;
  mapping_system: string;
  target_code: string;
  target_label: string | null;
  source: string;
};

/**
 * Reconstructs the self-contained vault asset-state payload for a run from the DB:
 * the asset_states snapshot for `runId` joined with its HWO mappings, plus the period.
 * This is what {@link VaultWriter.writeShard} persists so the quarter can later
 * be rebuilt from the vault alone.
 */
export function assetStateRecordsForVault(
  db: Database.Database,
  runId: string,
): VaultAssetStateRecord[] {
  return [...iterateAssetStateRecordsForVault(db, runId)];
}

export function* iterateAssetStateRecordsForVault(
  db: Database.Database,
  runId: string,
): Generator<VaultAssetStateRecord> {
  const rows = db.prepare(`
    SELECT s.asset_id, s.domain, s.gewerk_group, s.hwo_uid, s.hwo_provenance,
           s.bundesland, s.gemeinde, s.period,
           m.mapping_system, m.target_code, m.target_label, m.source
    FROM asset_states s
    LEFT JOIN asset_hwo_mappings m
      ON m.asset_id = s.asset_id AND m.run_id = s.run_id
    WHERE s.run_id = ?
    ORDER BY s.asset_id, m.mapping_system, m.target_code
  `).iterate(runId) as IterableIterator<AssetStateDbRow & Partial<MappingDbRow>>;
  let current: AssetStateDbRow | null = null;
  let mappings: AssetStateMapping[] = [];
  const build = (): VaultAssetStateRecord | null => current ? {
    asset_id: current.asset_id,
    domain: current.domain,
    gewerk_group: current.gewerk_group,
    hwo_uid: current.hwo_uid,
    hwo_provenance: current.hwo_provenance,
    bundesland: current.bundesland,
    gemeinde: current.gemeinde,
    mappings,
    period: current.period ?? "",
  } : null;
  for (const row of rows) {
    if (current && row.asset_id !== current.asset_id) {
      const record = build();
      if (record) yield record;
      mappings = [];
    }
    current = row;
    if (row.mapping_system && row.target_code && row.source) {
      mappings.push({
        mapping_system: row.mapping_system,
        target_code: row.target_code,
        target_label: row.target_label ?? null,
        source: row.source,
      });
    }
  }
  const final = build();
  if (final) yield final;
}

/**
 * Maps vault asset-state records (read back via DuckDB, so values may be Date/bigint and
 * mappings a struct array) into the {@link AssetStateInput}s consumed by
 * {@link writeAssetStatesDeduped}. The period travels with each record (vault is
 * self-contained); the emit-bundle fallback supplies it from the manifest instead.
 */
export function vaultAssetStatesToInputs(records: VaultAssetStateRecord[]): AssetStateInput[] {
  return records.map((r) => {
    const o = r as unknown as Record<string, unknown>;
    const record: AssetStateRecord = {
      asset_id: String(o.asset_id),
      domain: String(o.domain),
      gewerk_group: toStr(o.gewerk_group),
      hwo_uid: toStr(o.hwo_uid),
      hwo_provenance: toStr(o.hwo_provenance),
      bundesland: toStr(o.bundesland),
      gemeinde: toStr(o.gemeinde),
      mappings: normalizeMappings(o.mappings),
    };
    return { record, period: o.period == null ? "" : String(o.period) };
  });
}

/** Wraps emit-bundle records (no per-record period) into AssetStateInputs for the fallback path. */
export function bundleAssetStatesToInputs(
  records: readonly AssetStateRecord[],
  period: string,
): AssetStateInput[] {
  return records.map((record) => ({ record, period }));
}

// ── Observations: vault row → fresh DB ──────────────────────────────────────

export type RebuiltObservation = {
  observation: Observation;
  signing: {
    signature: string | null;
    signed_at: string | null;
    signing_key_id: string | null;
    collector_id: string | null;
  };
};

/**
 * Coerces a vault observation row (as returned by DuckDB `getRowObjectsJS`: Date for
 * TIMESTAMP columns, possibly bigint for integer columns, plus an injected `year`
 * partition column) back into a clean {@link Observation} and its signing fields.
 */
export function normalizeVaultObservation(row: Record<string, unknown>): RebuiltObservation {
  const observation: Observation = {
    observation_id: String(row.observation_id),
    asset_id: String(row.asset_id),
    crawl_id: String(row.crawl_id),
    signal_path: String(row.signal_path),
    value_bool: toBool(row.value_bool),
    value_num: toNum(row.value_num),
    value_str: toStr(row.value_str),
    value_json: toStr(row.value_json),
    value_type: String(row.value_type) as Observation["value_type"],
    observed_at: toIso(row.observed_at) ?? "",
    recorded_at: toIso(row.recorded_at) ?? "",
    collector_version: String(row.collector_version),
    probe_version: toStr(row.probe_version),
    ruleset_version: String(row.ruleset_version),
    source_hash: toStr(row.source_hash),
    crawl_hash: toStr(row.crawl_hash),
    evidence_ref: toStr(row.evidence_ref),
    confidence: toNum(row.confidence) ?? 0,
    collection_status: (row.collection_status ?? null) as Observation["collection_status"],
    status: String(row.status) as Observation["status"],
    superseded_by: toStr(row.superseded_by),
    deprecated_reason: toStr(row.deprecated_reason),
  };
  return {
    observation,
    signing: {
      signature: toStr(row.signature),
      signed_at: toIso(row.signed_at),
      signing_key_id: toStr(row.signing_key_id),
      collector_id: toStr(row.collector_id),
    },
  };
}

export type RebuildObsOptions = {
  /** Run id stamped on the rebuilt observations; the re-score runs against this id. */
  runId: string;
  period: string;
  /** Ontology version is a sync-time annotation absent from the vault row; supplied here. */
  ontologyVersion: string;
};

const REBUILD_OBS_SQL = `
  INSERT OR IGNORE INTO observations
    (id, asset_id, signal_path, ontology_version, value_bool, value_num, value_str, value_json,
     value_type, observed_at, recorded_at, run_id, evidence_ref, extractor_version, confidence,
     status, obs_json, collection_status, period, factory_run_id, crawl_hash,
     signature, signed_at, signing_key_id, collector_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Inserts vault observation rows into a fresh observations table. The DB primary key
 * `id` is set from `observation_id`, so the rebuilt rows carry the SAME ids the original
 * score consumed — which is exactly what makes the re-derived computation_hash identical.
 * `obs_json` + signing columns are reconstructed so the rebuilt DB stays signature-checkable.
 * INSERT OR IGNORE keeps it idempotent on re-run. Returns rows inserted.
 */
export function insertRebuiltObservations(
  db: Database.Database,
  rows: Array<Record<string, unknown>>,
  opts: RebuildObsOptions,
): number {
  const stmt = db.prepare(REBUILD_OBS_SQL);
  const run = db.transaction((batch: Array<Record<string, unknown>>): number => {
    let inserted = 0;
    for (const raw of batch) {
      const { observation: o, signing } = normalizeVaultObservation(raw);
      const r = stmt.run(
        o.observation_id,
        o.asset_id,
        o.signal_path,
        opts.ontologyVersion,
        o.value_bool === null ? null : o.value_bool ? 1 : 0,
        o.value_num,
        o.value_str,
        o.value_json,
        o.value_type,
        o.observed_at,
        o.recorded_at,
        opts.runId,
        o.evidence_ref,
        o.probe_version,
        o.confidence,
        o.status,
        JSON.stringify(o),
        o.collection_status ?? null,
        opts.period,
        o.crawl_id,
        o.crawl_hash,
        signing.signature,
        signing.signed_at,
        signing.signing_key_id,
        signing.collector_id,
      );
      inserted += r.changes;
    }
    return inserted;
  });
  return run(rows);
}
