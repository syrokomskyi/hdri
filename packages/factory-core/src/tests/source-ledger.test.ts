import { describe, expect, it } from "vitest";
import { freezeFrame, isSameAcceptedBatch } from "../lib/source-ledger.js";

describe("source ledger", () => {
  it("keeps previously accepted assets despite retractions", () => {
    const frame = freezeFrame("2026-q3", [
      { sourceOccurrenceId: "so-1", batchId: "2026-q2-de-05", periodAdded: "2026-q2", provisionalAssetId: "da-old", normalisedDomain: "old.de", disposition: "assertion" },
      { sourceOccurrenceId: "so-2", batchId: "2026-q3-de-01", periodAdded: "2026-q3", provisionalAssetId: "da-old", normalisedDomain: "old.de", disposition: "retraction", correctionOf: "so-1" },
      { sourceOccurrenceId: "so-3", batchId: "2026-q3-de-01", periodAdded: "2026-q3", provisionalAssetId: "da-new", normalisedDomain: "new.de", disposition: "assertion" },
    ], { ledgerHead: "ledger-a", occurrenceProjectionSha256: "occurrences-a" });
    expect(frame.candidateIds).toEqual(["da-new", "da-old"]);
    expect(frame.includedBatchIds).toEqual(["2026-q2-de-05", "2026-q3-de-01"]);
  });

  it("makes source batch replay explicit", () => {
    expect(isSameAcceptedBatch({ batchId: "q3", batchHash: "a" }, { batchId: "q3", batchHash: "a" })).toBe("already-sealed");
    expect(isSameAcceptedBatch({ batchId: "q3", batchHash: "a" }, { batchId: "q3", batchHash: "b" })).toBe("conflict");
  });
});
