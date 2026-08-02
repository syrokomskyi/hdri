/**
 * WP12: the cross-year identity registry accumulates across years in the vault.
 *
 * Proves the storage half of stable identity: identity shards written under different
 * years are read back as ONE cross-year provisional→canonical map (real DuckDB Parquet),
 * so a canonical id minted in an earlier year is still resolvable in a later one.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultReader } from "../reader.js";
import { VaultWriter, type VaultAssetIdentityRecord } from "../writer.js";

let vaultDir: string;

const rec = (
  provisional: string,
  canonical: string,
  domain: string,
  period: string,
): VaultAssetIdentityRecord => ({
  provisional_id: provisional,
  canonical_id: canonical,
  domain,
  first_seen_period: period,
  minted_at: "2026-07-01T00:00:00.000Z",
});

beforeEach(() => {
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp12-identity-"));
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

describe("cross-year identity registry (WP12)", () => {
  it("returns an empty map before any shard exists", async () => {
    const map = await new VaultReader(vaultDir).getIdentityMap();
    expect(map.size).toBe(0);
  });

  it("reads identity shards from multiple years as one cross-year map", async () => {
    const writer = new VaultWriter(vaultDir);
    await writer.writeShard(
      "asset_identity",
      [rec("da-a", "canon-a", "a.de", "2026-q3")] as readonly object[],
      {
        year: 2026,
        runId: "run-2026",
      },
    );
    await writer.writeShard(
      "asset_identity",
      [rec("da-b", "canon-b", "b.de", "2027-q1")] as readonly object[],
      {
        year: 2027,
        runId: "run-2027",
      },
    );

    const reader = new VaultReader(vaultDir);
    const map = await reader.getIdentityMap();
    expect(map.size).toBe(2);
    expect(map.get("da-a")).toBe("canon-a"); // minted in 2026, still resolvable
    expect(map.get("da-b")).toBe("canon-b"); // minted in 2027

    const records = await reader.getAssetIdentityRecords();
    expect(records.map((r) => r.provisional_id).sort()).toEqual(["da-a", "da-b"]);
  });
});
