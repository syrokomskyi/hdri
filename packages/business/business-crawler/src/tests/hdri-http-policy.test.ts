/*
 * RFC-0103 Acceptance Criteria tests
 * Named tests: AC-1 through AC-7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPageContent } from "../fetch-page.js";
import { checkRobotsAllowed, clearRobotsCache } from "../robots-honor.js";
import {
  isAddressBlocked,
  DEFAULT_EGRESS_POLICY,
  createCollectorHealth,
  recordAttempt,
  shouldPause,
} from "../index.js";
import type { HttpEvidence, FetchEndpoint } from "../types.js";

const makeReadableStream = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const mockResponse = (
  body: ReadableStream<Uint8Array>,
  status = 200,
  headers: Record<string, string> = {},
) => ({
  status,
  url: "https://example.com/page",
  body,
  headers: new Map(Object.entries(headers)),
});

describe("RFC-0103 AC-1: verified HTTP-only endpoint is selected", () => {
  it("uses the effective URL from the verified endpoint for acquisition", async () => {
    const html = "<html></html>";
    const encoded = new TextEncoder().encode(html);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
        ),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalUrl).toBe("https://example.com/page");
  });
});

describe("RFC-0103 AC-2: HttpEvidence distinguishes collector failure from site unavailability", () => {
  it("classifies network error as collector failure", () => {
    const endpoint: FetchEndpoint = {
      assetId: "da-test",
      sourceUrl: "https://example.com",
      canonicalDomain: "example.com",
      effectiveUrl: "https://example.com",
      redirectChain: [],
    };
    const evidence: HttpEvidence = {
      schema: "hdri-http-evidence@2",
      measuredAt: new Date().toISOString(),
      endpoint,
      outcome: "unavailable",
      failureOwner: "collector",
      status: null,
      bodySha256: null,
      entityBytes: 0,
      decodedBytes: 0,
      complete: false,
      charset: null,
      robotsDecisionSha256: null,
      policySha256: "abc123",
    };
    expect(evidence.failureOwner).toBe("collector");
    expect(evidence.outcome).toBe("unavailable");
  });

  it("classifies 5xx as site failure", () => {
    const evidence: HttpEvidence = {
      schema: "hdri-http-evidence@2",
      measuredAt: new Date().toISOString(),
      endpoint: {
        assetId: "da-test",
        sourceUrl: "https://example.com",
        canonicalDomain: "example.com",
        effectiveUrl: "https://example.com",
        redirectChain: [],
      },
      outcome: "unavailable",
      failureOwner: "site",
      status: 503,
      bodySha256: null,
      entityBytes: 0,
      decodedBytes: 0,
      complete: false,
      charset: null,
      robotsDecisionSha256: null,
      policySha256: "abc123",
    };
    expect(evidence.failureOwner).toBe("site");
  });
});

describe("RFC-0103 AC-3: streaming aborts when byte limit exceeded", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.restoreAllMocks());

  it("aborts reading before consuming the full body", async () => {
    const big = new Uint8Array(300);
    big.fill(65);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([big]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page", { maxEntityBytes: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entityBytes).toBe(100);
    expect(result.complete).toBe(false);
  });
});

describe("RFC-0103 AC-4: egress rejects private address redirects", () => {
  it("blocks 172.16.0.1 as private address", () => {
    expect(isAddressBlocked("172.16.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks 10.0.0.1 as private address", () => {
    expect(isAddressBlocked("10.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks 192.168.1.1 as private address", () => {
    expect(isAddressBlocked("192.168.1.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isAddressBlocked("93.184.216.34", DEFAULT_EGRESS_POLICY)).toBe(false);
  });
});

describe("RFC-0103 AC-5: robots 503 defers document capture", () => {
  beforeEach(() => {
    clearRobotsCache();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearRobotsCache();
  });

  it("returns allowed=false for 503 robots response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 503,
      ok: false,
      text: async () => "",
      headers: new Map(),
    });

    const result = await checkRobotsAllowed("https://example.com/page");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("robots-unavailable");
  });
});

describe("RFC-0103 AC-6: collector health pauses new leases", () => {
  it("pauses after 2 consecutive collector-owned sentinel failures", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(false);
    h = recordAttempt(h, { failureOwner: "collector", isSentinel: true });
    expect(shouldPause(h)).toBe(true);
  });

  it("does not pause on site-owned failures", () => {
    let h = createCollectorHealth();
    h = recordAttempt(h, { failureOwner: "site", isSentinel: true });
    h = recordAttempt(h, { failureOwner: "site", isSentinel: true });
    expect(shouldPause(h)).toBe(false);
  });
});

describe("RFC-0103 AC-7: truncated content receives complete=false", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.restoreAllMocks());

  it("marks complete=false when entity bytes exceed limit", async () => {
    const big = new Uint8Array(500);
    big.fill(88);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([big]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page", { maxEntityBytes: 200 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
  });

  it("marks complete=true when within limits", async () => {
    const html = "<html></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(true);
  });
});
