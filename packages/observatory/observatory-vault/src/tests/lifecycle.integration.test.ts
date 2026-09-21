/**
 * WP13: the lifecycle-event stream is durable and cross-year.
 *
 * Proves the storage half of the "business story": events written under different years
 * read back (real DuckDB Parquet) as one chronological log, which reconstructs into the
 * correct timeline — so a business's history survives loss of the working DB.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reconstructAssetHistory, type AssetLifecycleEvent } from "@syrokomskyi/observatory-core";
import { VaultReader } from "../reader.js";
import { VaultWriter } from "../writer.js";

let vaultDir: string;

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
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp13-lifecycle-"));
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("cross-year lifecycle stream (WP13)", () => {
  it("returns no events before any shard exists", async () => {
    expect(await new VaultReader(vaultDir).getLifecycleEvents()).toEqual([]);
  });

  it("reads events from multiple years and reconstructs the business story", async () => {
    // Canonical UTC ISO (millis) — the form new Date().toISOString() emits and the vault
    // stores; DuckDB's TIMESTAMP round-trip normalises to exactly this.
    const writer = new VaultWriter(vaultDir);
    await writer.writeShard(
      "asset_lifecycle",
      [
        ev({
          event_id: "e1",
          asset_id: "da-a",
          event_type: "founded",
          event_at: "2024-03-01T00:00:00.000Z",
          domain: "old.de",
        }),
      ] as readonly object[],
      { year: 2024, runId: "run-2024" },
    );
    await writer.writeShard(
      "asset_lifecycle",
      [
        ev({
          event_id: "e2",
          asset_id: "da-a",
          event_type: "renamed",
          event_at: "2026-06-01T00:00:00.000Z",
          domain: "new.de",
        }),
        ev({
          event_id: "e3",
          asset_id: "da-a",
          event_type: "closed",
          event_at: "2026-09-01T00:00:00.000Z",
        }),
      ] as readonly object[],
      { year: 2026, runId: "run-2026" },
    );

    const events = await new VaultReader(vaultDir).getLifecycleEvents();
    expect(events).toHaveLength(3);

    const timeline = reconstructAssetHistory("da-a", events);
    expect(timeline.founded_at).toBe("2024-03-01T00:00:00.000Z"); // from the 2024 shard, same instant
    expect(timeline.domains).toEqual(["old.de", "new.de"]);
    expect(timeline.status).toBe("closed");
    expect(timeline.closed_at).toBe("2026-09-01T00:00:00.000Z");
  });
});
