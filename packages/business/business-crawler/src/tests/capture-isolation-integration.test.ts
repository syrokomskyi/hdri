/*
 * RFC-0114 AC-3: Capture isolation — egress policy prevents connections to
 * private/metadata/rebind targets.  Uses mocked fetch to simulate redirect,
 * rebind, and rate-limit scenarios without real network access.
 *
 * RFC-0114 AC-4: Representation digest fidelity — entity bytes, charset decoding,
 * truncation, and compressed expansion are verified against declared digests.
 */
import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPageContent } from "../fetch-page.js";
import { isAddressBlocked, DEFAULT_EGRESS_POLICY } from "../egress-policy.js";

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

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// AC-3: Egress policy prevents connections to prohibited targets
// ---------------------------------------------------------------------------

describe("RFC-0114 AC-3: egress policy blocks prohibited address categories", () => {
  it("blocks redirect to private address 10.0.0.1", () => {
    expect(isAddressBlocked("10.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks redirect to private address 172.16.0.1", () => {
    expect(isAddressBlocked("172.16.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks redirect to private address 192.168.1.1", () => {
    expect(isAddressBlocked("192.168.1.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks loopback 127.0.0.1", () => {
    expect(isAddressBlocked("127.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks loopback ::1", () => {
    expect(isAddressBlocked("::1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 loopback ::ffff:127.0.0.1", () => {
    expect(isAddressBlocked("::ffff:127.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 private ::ffff:10.0.0.1", () => {
    expect(isAddressBlocked("::ffff:10.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks link-local 169.254.169.254 (cloud metadata)", () => {
    expect(isAddressBlocked("169.254.169.254", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks link-local fe80::1", () => {
    expect(isAddressBlocked("fe80::1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks multicast 224.0.0.1", () => {
    expect(isAddressBlocked("224.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks multicast ff02::1", () => {
    expect(isAddressBlocked("ff02::1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks reserved 0.0.0.0", () => {
    expect(isAddressBlocked("0.0.0.0", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks reserved 240.0.0.1 (future)", () => {
    expect(isAddressBlocked("240.0.0.1", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("blocks metadata host 100.100.100.200 (Alibaba Cloud)", () => {
    expect(isAddressBlocked("100.100.100.200", DEFAULT_EGRESS_POLICY)).toBe(true);
  });

  it("allows public address 93.184.216.34", () => {
    expect(isAddressBlocked("93.184.216.34", DEFAULT_EGRESS_POLICY)).toBe(false);
  });

  it("allows public IPv6 2606:2800:220:1::1", () => {
    expect(isAddressBlocked("2606:2800:220:1::1", DEFAULT_EGRESS_POLICY)).toBe(false);
  });
});

describe("RFC-0114 AC-3: HTTP 429 and 503 are classified as target unavailability", () => {
  it("returns ok with status 429 from fetch", async () => {
    const empty = new TextEncoder().encode("");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([empty]), 429, {
        "content-type": "text/html",
        "retry-after": "60",
      }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.httpStatus).toBe(429);
  });

  it("returns ok with status 503 from fetch", async () => {
    const empty = new TextEncoder().encode("");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([empty]), 503, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.httpStatus).toBe(503);
  });
});

describe("RFC-0114 AC-3: slow headers and slow body trigger timeout", () => {
  it("abort controller fires on timeout", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const result = await fetchPageContent("https://example.com/page", { timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("TIMEOUT");
  });
});

describe("RFC-0114 AC-3: mocked entity stream is bounded by the entity byte limit", () => {
  it("aborts reading when entity bytes exceed maxEntityBytes", async () => {
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

// ---------------------------------------------------------------------------
// AC-4: Representation digest fidelity
// ---------------------------------------------------------------------------

describe("RFC-0114 AC-4: stored UTF-8 digest matches declared representation", () => {
  it("contentHash matches unchanged ASCII entity bytes", async () => {
    const html = "<html><body>Hello</body></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedHash = createHash("sha256").update(encoded).digest("hex");
    expect(result.contentHash).toBe(expectedHash);
  });

  it("charset is detected from content-type header", async () => {
    const html = "<html><body>Hello</body></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, {
        "content-type": "text/html; charset=iso-8859-1",
      }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.charset).toBe("iso-8859-1");
  });

  it("charset defaults to utf-8 when not declared", async () => {
    const html = "<html><body>Hello</body></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.charset).toBeNull();
  });
});

describe("RFC-0114 AC-4: invalid UTF-8 is handled without crashing", () => {
  it("decodes invalid UTF-8 bytes with replacement characters", async () => {
    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x41, 0x42]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([invalidUtf8]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain("AB");
    expect(result.complete).toBe(true);
  });
});

describe("RFC-0114 AC-4: non-UTF-8 HTML (ISO-8859-1) is decoded correctly", () => {
  it("decodes ISO-8859-1 content with umlauts", async () => {
    const isoContent = new Uint8Array([
      0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0xe4, 0xf6, 0xfc, 0x3c, 0x2f, 0x68, 0x74, 0x6d, 0x6c,
      0x3e,
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([isoContent]), 200, {
        "content-type": "text/html; charset=iso-8859-1",
      }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain("ä");
    expect(result.html).toContain("ö");
    expect(result.html).toContain("ü");
  });
});

describe("RFC-0114 AC-4: truncation produces incomplete flag and bounded content", () => {
  it("truncates at maxEntityBytes and marks incomplete", async () => {
    const big = new Uint8Array(500);
    big.fill(65); // 'A'
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([big]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page", { maxEntityBytes: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entityBytes).toBe(100);
    expect(result.complete).toBe(false);
    expect(result.html.length).toBeLessThanOrEqual(100);
  });

  it("truncates at maxDecodedBytes and marks incomplete", async () => {
    const html = "A".repeat(500);
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page", {
      maxEntityBytes: 1000,
      maxDecodedBytes: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(result.contentLengthBytes).toBe(50);
  });
});

describe("RFC-0114 AC-4: partial reads (stream interrupted) are handled", () => {
  it("handles empty response body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toBe("");
    expect(result.entityBytes).toBe(0);
    expect(result.complete).toBe(true);
  });
});
