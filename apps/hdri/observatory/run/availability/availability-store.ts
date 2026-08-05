/*
<MODULE_CONTRACT>
<purpose>Materialises website availability transitions separately from business lifecycle events.</purpose>
<non-goals><item>Never infers that a business closed or reopened.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0028 persists previously-live-only website transitions.</item></CHANGE_SUMMARY>
*/

import type Database from "better-sqlite3";
import {
  deriveAvailabilityTransition,
  LIVENESS_OUTCOME_POLICY_VERSION,
  sha256,
  type LivenessOutcome,
  type WebsitePanelState,
} from "@syrokomskyi/observatory-core";

type OutcomeRow = {
  provisional_id: string;
  canonical_id: string;
  value_str: LivenessOutcome;
  observed_at: string;
  evidence_ref: string | null;
};

export const materializeAvailabilityTransitions = (
  db: Database.Database,
  runId: string,
  period: string,
): number => {
  const rows = db.prepare(`
    SELECT o.asset_id AS provisional_id, m.canonical_id, o.value_str, o.observed_at, o.evidence_ref
    FROM observations o
    JOIN asset_id_map m ON m.provisional_id = o.asset_id
    WHERE o.run_id = ?
      AND o.signal_path = 'availability.website.outcome'
    ORDER BY m.canonical_id
  `).all(runId) as OutcomeRow[];
  const previous = db.prepare(`
    SELECT state FROM website_availability_events
    WHERE asset_id = ? AND period < ?
    ORDER BY period DESC LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO website_availability_events
      (event_id, asset_id, period, outcome, state, event_type, observed_at, policy_version, evidence_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return db.transaction(() => {
    let inserted = 0;
    for (const row of rows) {
      const prior = previous.get(row.canonical_id, period) as { state: WebsitePanelState } | undefined;
      const transition = deriveAvailabilityTransition(prior?.state ?? "candidate_never_live", row.value_str);
      const eventId = sha256(
        ["hdri:website-availability-event:v1", row.canonical_id, period, row.value_str].join("\0"),
      );
      inserted += insert.run(
        eventId,
        row.canonical_id,
        period,
        row.value_str,
        transition.state,
        transition.event,
        row.observed_at,
        LIVENESS_OUTCOME_POLICY_VERSION,
        row.evidence_ref,
      ).changes;
    }
    return inserted;
  })();
};
