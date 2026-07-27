/**
 * WP15: methodology changelog — the "what changed, and did it break comparability?" invariant.
 *
 * Proves the changelog (1) orders periods and marks the first as baseline, (2) flags a
 * comparability break exactly when methodology_hash changes, (3) surfaces a same-version content
 * change (the sneaky case), (4) treats a frame-only change as a non-breaking change, and (5) keeps
 * the latest-frozen record when a period was republished.
 */

import { describe, it, expect } from "vitest";
import { buildChangelog, type MethodologyRecord } from "../../tools/methodology-changelog-core";

const rec = (over: Partial<MethodologyRecord>): MethodologyRecord => ({
  period: "2026-q2",
  runId: "r",
  methodologyHash: "mh",
  codebookId: "hdri",
  codebookVersion: "1.0.0",
  ontologyVersion: "1.0.0",
  scorerVersion: "1.0.0",
  codebookSha256: "cb-a",
  ontologySha256: "on-a",
  frameSha256: "fr-a",
  frozenAt: "2026-07-01T00:00:00Z",
  ...over,
});

describe("WP15 methodology-changelog-core", () => {
  it("orders periods and marks the first as baseline", () => {
    const entries = buildChangelog([
      rec({ period: "2026-q3", methodologyHash: "mh2" }),
      rec({ period: "2026-q2", methodologyHash: "mh1" }),
    ]);
    expect(entries.map((e) => e.period)).toEqual(["2026-q2", "2026-q3"]);
    expect(entries[0]!.status).toBe("baseline");
    expect(entries[0]!.comparabilityBreak).toBe(false);
  });

  it("flags a comparability break when methodology_hash changes (version bump)", () => {
    const entries = buildChangelog([
      rec({
        period: "2026-q2",
        methodologyHash: "mh1",
        codebookVersion: "1.0.0",
        codebookSha256: "cb-a",
      }),
      rec({
        period: "2026-q3",
        methodologyHash: "mh2",
        codebookVersion: "1.1.0",
        codebookSha256: "cb-b",
      }),
    ]);
    const q3 = entries[1]!;
    expect(q3.status).toBe("changed");
    expect(q3.comparabilityBreak).toBe(true);
    expect(q3.changes.find((c) => c.field === "codebook_version")).toEqual({
      field: "codebook_version",
      from: "1.0.0",
      to: "1.1.0",
    });
  });

  it("surfaces a same-version content change", () => {
    const entries = buildChangelog([
      rec({
        period: "2026-q2",
        methodologyHash: "mh1",
        codebookVersion: "1.0.0",
        codebookSha256: "cb-a",
      }),
      rec({
        period: "2026-q3",
        methodologyHash: "mh2",
        codebookVersion: "1.0.0",
        codebookSha256: "cb-b",
      }),
    ]);
    const q3 = entries[1]!;
    expect(q3.comparabilityBreak).toBe(true);
    expect(q3.changes.some((c) => c.field === "codebook_content")).toBe(true);
  });

  it("treats a frame-only change as a non-breaking change", () => {
    const entries = buildChangelog([
      rec({ period: "2026-q2", methodologyHash: "mh1", frameSha256: "fr-a" }),
      rec({ period: "2026-q3", methodologyHash: "mh1", frameSha256: "fr-b" }),
    ]);
    const q3 = entries[1]!;
    expect(q3.status).toBe("changed");
    expect(q3.comparabilityBreak).toBe(false);
    expect(q3.changes).toEqual([{ field: "frame", from: "fr-a", to: "fr-b" }]);
  });

  it("reports unchanged when nothing moved", () => {
    const entries = buildChangelog([
      rec({ period: "2026-q2", methodologyHash: "mh1" }),
      rec({ period: "2026-q3", methodologyHash: "mh1" }),
    ]);
    expect(entries[1]!.status).toBe("unchanged");
    expect(entries[1]!.changes).toHaveLength(0);
  });

  it("keeps the latest-frozen record when a period was republished", () => {
    const entries = buildChangelog([
      rec({ period: "2026-q2", methodologyHash: "old", frozenAt: "2026-07-01T00:00:00Z" }),
      rec({ period: "2026-q2", methodologyHash: "new", frozenAt: "2026-08-01T00:00:00Z" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.methodologyHash).toBe("new");
  });
});
