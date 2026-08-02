import { describe, expect, it } from "vitest";
import { parseShardPath } from "../../tools/vault-manifest-core";

describe("parseShardPath", () => {
  it("parses the observations shard layout", () => {
    expect(
      parseShardPath("observations/year=2026/c72f3b7d-0f23-4f9e-b53c-25abf4e78188.parquet"),
    ).toEqual({
      kind: "observations",
      year: 2026,
      runId: "c72f3b7d-0f23-4f9e-b53c-25abf4e78188",
    });
  });

  it("parses every vault stream kind", () => {
    expect(parseShardPath("asset_states/year=2027/r.parquet")?.kind).toBe("asset_states");
    expect(parseShardPath("asset_identity/year=2026/backfill.parquet")?.kind).toBe(
      "asset_identity",
    );
    expect(parseShardPath("asset_lifecycle/year=2026/r.parquet")?.kind).toBe("asset_lifecycle");
  });

  it("returns null for non-shard paths", () => {
    expect(parseShardPath("vault-manifest.json")).toBeNull();
    expect(parseShardPath("methodology/blobs/deadbeef.yaml")).toBeNull(); // 3 parts but not year=/.parquet
    expect(parseShardPath("observations/2026/r.parquet")).toBeNull(); // missing year= prefix
    expect(parseShardPath("observations/year=2026/r.csv")).toBeNull(); // not .parquet
    expect(parseShardPath("observations/year=abcd/r.parquet")).toBeNull(); // non-numeric year
    expect(parseShardPath("observations/year=2026/.parquet")).toBeNull(); // empty runId
  });
});
