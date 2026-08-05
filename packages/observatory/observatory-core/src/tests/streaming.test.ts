import { describe, expect, it } from "vitest";
import { canCommitCheckpoint, observationKey } from "../streaming.js";

describe("streaming contracts", () => {
  const input = { period: "2026-q3", capsuleId: "019", provisionalAssetId: "da-a", signalPath: "profile.has_email", sourceResultSha256: "raw", extractorVersion: "1" };
  it("keeps an observation key stable on restart and distinct on source change", () => {
    expect(observationKey(input)).toBe(observationKey(input));
    expect(observationKey(input)).not.toBe(observationKey({ ...input, sourceResultSha256: "changed" }));
  });
  it("commits only a durable partition", () => {
    expect(canCommitCheckpoint({ partition: 0, lastSortKey: "a", rowsWritten: 1, partitionSha256: "hash" })).toBe(true);
    expect(canCommitCheckpoint({ partition: 0, lastSortKey: "a", rowsWritten: 1, partitionSha256: null })).toBe(false);
  });
});
