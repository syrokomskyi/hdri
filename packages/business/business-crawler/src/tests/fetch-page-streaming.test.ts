import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPageContent } from "../fetch-page.js";

const makeReadableStream = (chunks: Uint8Array[]): ReadableStream<Uint8Array> => {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
};

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

describe("fetchPageContent — bounded streaming (RFC-0103)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns entityBytes, complete=true, charset for a normal page", async () => {
    const html = "<html><body>Hello</body></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, {
        "content-type": "text/html; charset=utf-8",
      }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(true);
    expect(result.entityBytes).toBe(encoded.length);
    expect(result.charset).toBe("utf-8");
    expect(result.html).toContain("Hello");
  });

  it("truncates and marks complete=false when entity bytes exceed maxEntityBytes", async () => {
    const big = new Uint8Array(300);
    big.fill(65); // 'A'
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([big]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page", { maxEntityBytes: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(result.entityBytes).toBe(100);
    expect(result.contentLengthBytes).toBeLessThanOrEqual(100);
  });

  it("detects charset from content-type header", async () => {
    const html = "<html><body>Hallo</body></html>";
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

  it("returns charset=null when content-type has no charset", async () => {
    const html = "<html></html>";
    const encoded = new TextEncoder().encode(html);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(makeReadableStream([encoded]), 200, { "content-type": "text/html" }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.charset).toBeNull();
  });

  it("returns failure with error code on network error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }),
    );

    const result = await fetchPageContent("https://example.com/page");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("ENOTFOUND");
  });
});
