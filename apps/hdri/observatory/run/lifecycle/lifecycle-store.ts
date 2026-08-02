/*
<MODULE_CONTRACT>
<purpose>Append-only persistence + query for business lifecycle events (WP13) in the
observatory DB, and a convenience that folds a business's events into its timeline.</purpose>
<non-goals>
  <item>Does not produce events — the dead-domain state machine (closed/reopened) and the
        manual-correction workflow (renamed/merged/split/reassigned) are the producers.</item>
  <item>Does not define the event model or reconstruction — that is @syrokomskyi/observatory-core/lifecycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP13: initial append-only lifecycle event store + timeline reconstruction.</item>
</CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import {
  assertValidLifecycleEvent,
  reconstructAssetHistory,
  type AssetLifecycleEvent,
  type AssetTimeline,
} from "@syrokomskyi/observatory-core";

const INSERT_SQL = `
  INSERT OR IGNORE INTO asset_lifecycle_events
    (event_id, asset_id, event_type, event_at, period, related_asset_id,
     domain, reason, source, recorded_at, evidence_ref)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Validates and appends lifecycle events. Each event is validated (throws on the first
 * invalid one, before any write) and inserted with INSERT OR IGNORE, so events are
 * immutable and re-appending an already-recorded event_id is a no-op. Returns the number
 * of new rows inserted.
 */
export function writeLifecycleEvents(
  db: Database.Database,
  events: readonly AssetLifecycleEvent[],
): number {
  for (const e of events) assertValidLifecycleEvent(e);

  const stmt = db.prepare(INSERT_SQL);
  const insert = db.transaction((batch: readonly AssetLifecycleEvent[]): number => {
    let inserted = 0;
    for (const e of batch) {
      const r = stmt.run(
        e.event_id,
        e.asset_id,
        e.event_type,
        e.event_at,
        e.period,
        e.related_asset_id,
        e.domain,
        e.reason,
        e.source,
        e.recorded_at,
        e.evidence_ref,
      );
      inserted += r.changes;
    }
    return inserted;
  });
  return insert(events);
}

/** Reads lifecycle events for `assetId` (or all events when omitted), oldest first. */
export function readLifecycleEvents(
  db: Database.Database,
  assetId?: string,
): AssetLifecycleEvent[] {
  const where = assetId ? "WHERE asset_id = ?" : "";
  const rows = db
    .prepare(
      `SELECT event_id, asset_id, event_type, event_at, period, related_asset_id,
              domain, reason, source, recorded_at, evidence_ref
       FROM asset_lifecycle_events ${where}
       ORDER BY event_at, recorded_at`,
    )
    .all(...(assetId ? [assetId] : [])) as AssetLifecycleEvent[];
  return rows;
}

/** Reads an asset's events and folds them into its reconstructed timeline. */
export function getAssetTimeline(db: Database.Database, assetId: string): AssetTimeline {
  return reconstructAssetHistory(assetId, readLifecycleEvents(db, assetId));
}
