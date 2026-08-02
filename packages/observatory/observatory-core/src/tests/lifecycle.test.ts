/**
 * WP13: lifecycle event validation + history reconstruction.
 */

import { describe, it, expect } from "vitest";
import {
  reconstructAssetHistory,
  validateLifecycleEvent,
  type AssetLifecycleEvent,
  type LifecycleEventType,
} from "../lifecycle.js";

let seq = 0;
const ev = (
  asset_id: string,
  event_type: LifecycleEventType,
  event_at: string,
  extra: Partial<AssetLifecycleEvent> = {},
): AssetLifecycleEvent => ({
  event_id: `e${++seq}`,
  asset_id,
  event_type,
  event_at,
  period: null,
  related_asset_id: null,
  domain: null,
  reason: null,
  source: "manual",
  recorded_at: event_at,
  evidence_ref: null,
  ...extra,
});

describe("validateLifecycleEvent (WP13)", () => {
  it("accepts a well-formed rename with a new domain", () => {
    expect(
      validateLifecycleEvent(ev("da-a", "renamed", "2026-01-01T00:00:00Z", { domain: "new.de" })),
    ).toEqual([]);
  });

  it("requires related_asset_id for relational events and forbids it otherwise", () => {
    expect(validateLifecycleEvent(ev("da-a", "merged", "2026-01-01T00:00:00Z"))).toContain(
      'event_type "merged" requires related_asset_id',
    );
    expect(
      validateLifecycleEvent(
        ev("da-a", "closed", "2026-01-01T00:00:00Z", { related_asset_id: "da-b" }),
      ),
    ).toContain('event_type "closed" must not set related_asset_id');
  });

  it("requires a domain for renamed/reassigned and rejects self-references + unknown types", () => {
    expect(validateLifecycleEvent(ev("da-a", "renamed", "2026-01-01T00:00:00Z"))).toContain(
      'event_type "renamed" requires domain',
    );
    expect(
      validateLifecycleEvent(
        ev("da-a", "merged", "2026-01-01T00:00:00Z", { related_asset_id: "da-a" }),
      ),
    ).toContain("related_asset_id must differ from asset_id");
    expect(
      validateLifecycleEvent(ev("da-a", "exploded" as LifecycleEventType, "2026-01-01T00:00:00Z")),
    ).toContain('unknown event_type "exploded"');
  });
});

describe("reconstructAssetHistory (WP13)", () => {
  it("folds founded → renamed → closed into a coherent timeline (out-of-order input)", () => {
    const events = [
      ev("da-a", "closed", "2026-09-01T00:00:00Z", { reason: "insolvency" }),
      ev("da-a", "founded", "2024-03-01T00:00:00Z", { domain: "old.de" }),
      ev("da-a", "renamed", "2025-06-01T00:00:00Z", { domain: "new.de" }),
      ev("da-other", "closed", "2026-01-01T00:00:00Z"), // different asset — ignored
    ];
    const t = reconstructAssetHistory("da-a", events);

    expect(t.founded_at).toBe("2024-03-01T00:00:00Z");
    expect(t.closed_at).toBe("2026-09-01T00:00:00Z");
    expect(t.status).toBe("closed");
    expect(t.current_domain).toBe("new.de");
    expect(t.domains).toEqual(["old.de", "new.de"]);
    expect(t.events.map((e) => e.event_type)).toEqual(["founded", "renamed", "closed"]);
  });

  it("tracks reopen after close (status returns to active, closed_at cleared)", () => {
    const t = reconstructAssetHistory("da-a", [
      ev("da-a", "founded", "2024-01-01T00:00:00Z", { domain: "a.de" }),
      ev("da-a", "closed", "2025-01-01T00:00:00Z"),
      ev("da-a", "reopened", "2025-08-01T00:00:00Z"),
    ]);
    expect(t.status).toBe("active");
    expect(t.closed_at).toBeNull();
  });

  it("records a merge as a terminal close into the surviving business", () => {
    const t = reconstructAssetHistory("da-a", [
      ev("da-a", "founded", "2024-01-01T00:00:00Z", { domain: "a.de" }),
      ev("da-a", "merged", "2026-02-01T00:00:00Z", { related_asset_id: "da-survivor" }),
    ]);
    expect(t.status).toBe("closed");
    expect(t.merged_into).toBe("da-survivor");
    expect(t.closed_at).toBe("2026-02-01T00:00:00Z");
  });

  it("collects split-offs and infers founded_at from the earliest event when none is explicit", () => {
    const t = reconstructAssetHistory("da-a", [
      ev("da-a", "split", "2025-05-01T00:00:00Z", { related_asset_id: "da-child-1" }),
      ev("da-a", "split", "2026-05-01T00:00:00Z", { related_asset_id: "da-child-2" }),
    ]);
    expect(t.split_into).toEqual(["da-child-1", "da-child-2"]);
    expect(t.founded_at).toBe("2025-05-01T00:00:00Z"); // no explicit founded → earliest event
    expect(t.status).toBe("active");
  });

  it("returns an empty, active timeline for an asset with no events", () => {
    const t = reconstructAssetHistory("da-none", []);
    expect(t).toMatchObject({ status: "active", founded_at: null, domains: [], events: [] });
  });
});
