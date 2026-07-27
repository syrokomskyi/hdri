/*
<MODULE_CONTRACT>
<purpose>Memory-bounded, collision-safe writers for ingesting factory bundles into the observatory DB.</purpose>
<non-goals>
  <item>Does not read emit bundles or manage idempotency markers (synced_bundles) — that stays in SyncFromFactoryGogol.</item>
  <item>Does not sign observations or write the vault.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP1: extracted from SyncFromFactoryGogol so the bounded-memory + collision-safe paths are unit-testable.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";

/** Observations are inserted in chunks of this size to bound peak memory. */
export const OBS_CHUNK = 5000;

const OBS_INSERT_SQL = `
  INSERT OR IGNORE INTO observations
    (id, asset_id, signal_path, ontology_version, value_bool, value_num,
     value_str, value_json, value_type, observed_at, recorded_at, run_id,
     evidence_ref, extractor_version, confidence, status, obs_json,
     collection_status, period, factory_run_id, crawl_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export type StreamInsertOptions = {
  /** Observatory run id stored on each observation row. */
  runId: string;
  ontologyVersion: string;
  period: string;
  /** Factory manifest run id, stored in factory_run_id for bundle linkage. */
  factoryRunId: string;
  chunkSize?: number;
  /** Called once per flushed chunk with the running count of streamed rows. */
  onProgress?: (seen: number) => void;
};

/**
 * Inserts an async stream of observations in bounded chunks. Peak memory is
 * O(chunkSize), not O(bundle size), so a ~100k-site quarter (millions of rows)
 * does not need to be buffered in a JS array. INSERT OR IGNORE keeps it
 * idempotent on observation_id, so re-syncing a bundle inserts nothing new.
 */
export async function streamInsertObservations(
  db: Database.Database,
  source: AsyncIterable<Observation>,
  opts: StreamInsertOptions,
): Promise<{ inserted: number; seen: number }> {
  const stmt = db.prepare(OBS_INSERT_SQL);
  const insertChunk = db.transaction((chunk: Observation[]): number => {
    let n = 0;
    for (const obs of chunk) {
      const r = stmt.run(
        obs.observation_id,
        obs.asset_id,
        obs.signal_path,
        opts.ontologyVersion,
        obs.value_bool === null ? null : obs.value_bool ? 1 : 0,
        obs.value_num,
        obs.value_str,
        obs.value_json,
        obs.value_type,
        obs.observed_at,
        obs.recorded_at,
        opts.runId,
        obs.evidence_ref,
        obs.probe_version,
        obs.confidence,
        obs.status,
        JSON.stringify(obs),
        obs.collection_status ?? null,
        opts.period,
        opts.factoryRunId,
        obs.crawl_hash ?? null,
      );
      n += r.changes;
    }
    return n;
  });

  const chunkSize = opts.chunkSize ?? OBS_CHUNK;
  let inserted = 0;
  let seen = 0;
  let chunk: Observation[] = [];
  for await (const obs of source) {
    chunk.push(obs);
    seen += 1;
    if (chunk.length >= chunkSize) {
      inserted += insertChunk(chunk);
      chunk = [];
      opts.onProgress?.(seen);
    }
  }
  if (chunk.length > 0) {
    inserted += insertChunk(chunk);
    opts.onProgress?.(seen);
  }
  return { inserted, seen };
}

const EXPIRE_OLD_SQL = `
  UPDATE asset_states SET valid_to = ? WHERE asset_id = ? AND valid_to IS NULL
`;

const INSERT_ASSET_SQL = `
  INSERT INTO asset_states
    (asset_id, domain, gewerk_group, hwo_uid, hwo_provenance, bundesland, gemeinde, valid_from, valid_to, run_id, period)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
`;

const INSERT_MAPPING_SQL = `
  INSERT OR REPLACE INTO asset_hwo_mappings
    (asset_id, mapping_system, target_code, target_label, source, run_id, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export type AssetStateInput = { record: AssetStateRecord; period: string };

export type WriteAssetStatesOptions = {
  runId: string;
  /** Single ingest timestamp for this run; used as valid_from and as the close time of prior rows. */
  now: string;
  onProgress?: (done: number, total: number) => void;
};

/**
 * Writes asset states for one run. Records are first deduped by asset_id
 * (last-write-wins), guaranteeing one row per asset — this is what prevents the
 * (asset_id, valid_from = now) PRIMARY KEY collision when the same asset appears
 * in more than one bundle of a run (multi-device / sharded harvest). For each
 * deduped asset it closes any prior open SCD-2 row (valid_to = now) and inserts
 * the new current row. Returns the number of distinct asset rows written.
 */
export function writeAssetStatesDeduped(
  db: Database.Database,
  records: Iterable<AssetStateInput>,
  opts: WriteAssetStatesOptions,
): number {
  const byId = new Map<string, AssetStateInput>();
  for (const r of records) {
    byId.set(r.record.asset_id, r);
  }
  if (byId.size === 0) return 0;

  const expireOld = db.prepare(EXPIRE_OLD_SQL);
  const insertAsset = db.prepare(INSERT_ASSET_SQL);
  const insertMapping = db.prepare(INSERT_MAPPING_SQL);

  const tx = db.transaction(() => {
    let done = 0;
    for (const { record: st, period } of byId.values()) {
      expireOld.run(opts.now, st.asset_id);
      insertAsset.run(
        st.asset_id,
        st.domain,
        st.gewerk_group,
        st.hwo_uid,
        st.hwo_provenance,
        st.bundesland,
        st.gemeinde,
        opts.now,
        opts.runId,
        period,
      );
      for (const m of st.mappings) {
        insertMapping.run(
          st.asset_id,
          m.mapping_system,
          m.target_code,
          m.target_label,
          m.source,
          opts.runId,
          opts.now,
        );
      }
      done += 1;
      opts.onProgress?.(done, byId.size);
    }
  });
  tx();
  return byId.size;
}
