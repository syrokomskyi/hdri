import { describe, expect, it } from "vitest";
import type { VaultShardEntry } from "@syrokomskyi/observatory-vault";
import { planReplication } from "../../tools/replication-core";

const shard = (p: string, sha: string, bytes = 100): VaultShardEntry => ({
  path: p,
  kind: "observations",
  year: 2026,
  runId: "r",
  rows: 1,
  bytes,
  sha256: sha,
  recordedAt: "2026-07-01T00:00:00Z",
});

describe("planReplication (offsite vault mirror)", () => {
  it("copies everything to an empty destination", () => {
    const shards = [shard("a.parquet", "sha-a"), shard("b.parquet", "sha-b", 200)];
    const plan = planReplication(shards, new Map());
    expect(plan.toCopy).toHaveLength(2);
    expect(plan.upToDate).toHaveLength(0);
    expect(plan.bytesToCopy).toBe(300);
  });

  it("skips shards already identical at the destination (idempotent)", () => {
    const shards = [shard("a.parquet", "sha-a"), shard("b.parquet", "sha-b")];
    const dest = new Map([
      ["a.parquet", "sha-a"],
      ["b.parquet", "sha-b"],
    ]);
    const plan = planReplication(shards, dest);
    expect(plan.toCopy).toHaveLength(0);
    expect(plan.upToDate).toHaveLength(2);
    expect(plan.bytesToCopy).toBe(0);
  });

  it("re-copies a shard whose destination sha256 differs (partial/corrupt earlier copy)", () => {
    const shards = [shard("a.parquet", "sha-a"), shard("b.parquet", "sha-b")];
    const dest = new Map([
      ["a.parquet", "sha-a"], // good
      ["b.parquet", "sha-STALE"], // corrupt/partial at dest → must re-copy
    ]);
    const plan = planReplication(shards, dest);
    expect(plan.toCopy.map((s) => s.path)).toEqual(["b.parquet"]);
    expect(plan.upToDate.map((s) => s.path)).toEqual(["a.parquet"]);
  });
});
