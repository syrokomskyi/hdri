import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { materializeAvailabilityTransitions } from "../availability/availability-store";

const setup = (): Database.Database => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE observations (asset_id TEXT, run_id TEXT, signal_path TEXT, value_str TEXT, observed_at TEXT, evidence_ref TEXT);
    CREATE TABLE asset_id_map (provisional_id TEXT, canonical_id TEXT);
    CREATE TABLE website_availability_events (
      event_id TEXT PRIMARY KEY, asset_id TEXT, period TEXT, outcome TEXT, state TEXT,
      event_type TEXT, observed_at TEXT, policy_version TEXT, evidence_ref TEXT,
      UNIQUE(asset_id, period)
    );
    INSERT INTO asset_id_map VALUES ('da-a', '019-canonical');
  `);
  return db;
};

describe("website availability store", () => {
  it("does not call a never-live candidate unavailable, but records later loss and restoration", () => {
    const db = setup();
    const add = (run: string, outcome: string): void => {
      db.prepare(`INSERT INTO observations VALUES ('da-a', ?, 'availability.website.outcome', ?, '2026-01-01T00:00:00.000Z', NULL)`).run(run, outcome);
    };
    add("q2", "unavailable");
    materializeAvailabilityTransitions(db, "q2", "2026-q2");
    add("q3", "reachable");
    materializeAvailabilityTransitions(db, "q3", "2026-q3");
    add("q4", "unavailable");
    materializeAvailabilityTransitions(db, "q4", "2026-q4");
    const events = db.prepare(`SELECT period, state, event_type FROM website_availability_events ORDER BY period`).all();
    expect(events).toEqual([
      { period: "2026-q2", state: "candidate_never_live", event_type: null },
      { period: "2026-q3", state: "active", event_type: "website_first_observed_live" },
      { period: "2026-q4", state: "unavailable", event_type: "website_became_unavailable" },
    ]);
    db.close();
  });
});
