/*
<MODULE_CONTRACT>
<purpose>Unit tests for BrowserEvidence contract (RFC-0105 AC-2: typed outcome field).</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import type { BrowserEvidence } from "@syrokomskyi/factory-core";

describe("BrowserEvidence contract", () => {
  it("accepts all 5 outcome values", () => {
    const outcomes: BrowserEvidence["outcome"][] = [
      "measured",
      "site-unavailable",
      "blocked",
      "not-observed",
      "instrument-failed",
    ];
    expect(outcomes).toHaveLength(5);
  });

  it("constructs a valid measured evidence", () => {
    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: "da-001",
      measuredAt: "2026-01-01T00:00:00Z",
      endpoint: "https://example.com",
      mainStatus: 200,
      effectiveUrl: "https://example.com",
      outcome: "measured",
      environmentSha256: "abc123",
      renderedDomSha256: "def456",
      reportSha256: "ghi789",
      deadlineMs: 120000,
      policySha256: "jkl012",
    };
    expect(evidence.outcome).toBe("measured");
    expect(evidence.schema).toBe("hdri-browser-evidence@1");
  });

  it("constructs a valid instrument-failed evidence", () => {
    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: "da-002",
      measuredAt: "2026-01-01T00:00:00Z",
      endpoint: "https://example.com",
      mainStatus: null,
      effectiveUrl: "https://example.com",
      outcome: "instrument-failed",
      environmentSha256: "abc123",
      renderedDomSha256: null,
      reportSha256: null,
      deadlineMs: 120000,
      policySha256: "jkl012",
    };
    expect(evidence.outcome).toBe("instrument-failed");
  });

  it("constructs a valid blocked evidence", () => {
    const evidence: BrowserEvidence = {
      schema: "hdri-browser-evidence@1",
      workKey: "da-003",
      measuredAt: "2026-01-01T00:00:00Z",
      endpoint: "https://example.com",
      mainStatus: 403,
      effectiveUrl: "https://example.com",
      outcome: "blocked",
      environmentSha256: "abc123",
      renderedDomSha256: "def456",
      reportSha256: null,
      deadlineMs: 120000,
      policySha256: "jkl012",
    };
    expect(evidence.outcome).toBe("blocked");
  });
});
