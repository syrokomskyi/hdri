/**
 * WP13: append-only lifecycle store — validate + append (idempotent) + timeline query.
 */

import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AssetLifecycleEvent } from "@syrokomskyi/observatory-core";
import { migrateObservatory } from "../db/migrate";
import {
  getAssetTimeline,
  readLifecycleEvents,
  writeLifecycleEvents,
} from "../lifecycle/lifecycle-store";

let db: Database.Database;

const ev = (
  over: Partial<AssetLifecycleEvent> &
    Pick<AssetLifecycleEvent, "event_id" | "asset_id" | "event_type" | "event_at">,
): AssetLifecycleEvent => ({
  period: null,
  related_asset_id: null,
  domain: null,
  reason: null,
  source: "manual",
  recorded_at: over.event_at,
  evidence_ref: null,
  ...over,
});

beforeEach(() => {
  db = new Database(":memory:");
  migrateObservatory(db);
});

afterEach(() => db.close());

describe("lifecycle store (WP13)", () => {
  it("appends events and reconstructs an asset's timeline from the DB", () => {
    const inserted = writeLifecycleEvents(db, [
      ev({
        event_id: "e1",
        asset_id: "da-a",
        event_type: "founded",
        event_at: "2024-03-01T00:00:00Z",
        domain: "old.de",
      }),
      ev({
        event_id: "e2",
        asset_id: "da-a",
        event_type: "renamed",
        event_at: "2025-06-01T00:00:00Z",
        domain: "new.de",
      }),
      ev({
        event_id: "e3",
        asset_id: "da-a",
        event_type: "merged",
        event_at: "2026-02-01T00:00:00Z",
        related_asset_id: "da-b",
      }),
      ev({
        event_id: "e4",
        asset_id: "da-b",
        event_type: "founded",
        event_at: "2024-01-01T00:00:00Z",
        domain: "b.de",
      }),
    ]);
    expect(inserted).toBe(4);

    const timeline = getAssetTimeline(db, "da-a");
    expect(timeline.founded_at).toBe("2024-03-01T00:00:00Z");
    expect(timeline.current_domain).toBe("new.de");
    expect(timeline.status).toBe("closed");
    expect(timeline.merged_into).toBe("da-b");
    expect(timeline.events).toHaveLength(3); // only da-a's events

    // da-b is untouched by da-a's merge event and stays active.
    expect(getAssetTimeline(db, "da-b").status).toBe("active");
  });

  it("is append-only + idempotent: re-appending an existing event_id inserts nothing", () => {
    const e = ev({
      event_id: "e1",
      asset_id: "da-a",
      event_type: "closed",
      event_at: "2026-01-01T00:00:00Z",
    });
    expect(writeLifecycleEvents(db, [e])).toBe(1);
    // Re-append the same event_id (even with tampered fields) — ignored, original preserved.
    expect(writeLifecycleEvents(db, [{ ...e, reason: "TAMPERED" }])).toBe(0);

    const rows = readLifecycleEvents(db, "da-a");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBeNull();
  });

  it("rejects an invalid event before writing anything", () => {
    expect(() =>
      writeLifecycleEvents(db, [
        ev({
          event_id: "ok",
          asset_id: "da-a",
          event_type: "closed",
          event_at: "2026-01-01T00:00:00Z",
        }),
        // merged without related_asset_id — invalid; the whole batch must not write.
        ev({
          event_id: "bad",
          asset_id: "da-a",
          event_type: "merged",
          event_at: "2026-02-01T00:00:00Z",
        }),
      ]),
    ).toThrow(/requires related_asset_id/);
    expect(readLifecycleEvents(db)).toHaveLength(0);
  });
});
