import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkSiteLiveness } from "../liveness.js";

const mockResponse = (status: number, url?: string): Response => {
  return {
    status,
    url: url ?? "https://example.com",
    body: { cancel: async () => {} },
  } as unknown as Response;
};

const makeNetworkError = (code: string, message: string): Error => {
  const cause = Object.assign(new Error(message), { code });
  const err = new Error(message);
  err.cause = cause;
  return err;
};

const makeAbortError = (): Error => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
};

describe("checkSiteLiveness", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns isLive=true for HTTP 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200)) as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0 });
    expect(result.isLive).toBe(true);
    expect(result.httpStatus).toBe(200);
  });

  it("falls back to GET on 405 and returns isLive=true", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(mockResponse(405)).mockResolvedValueOnce(mockResponse(200));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0 });
    expect(result.isLive).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns isLive=false for HTTP 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(500)) as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0 });
    expect(result.isLive).toBe(false);
    expect(result.httpStatus).toBe(500);
    expect(result.errorCode).toBe("HTTP_5XX");
  });

  it("returns TIMEOUT on abort", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(makeAbortError()) as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0, timeoutMs: 100 });
    expect(result.isLive).toBe(false);
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("returns ENOTFOUND for DNS failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(makeNetworkError("ENOTFOUND", "getaddrinfo ENOTFOUND bad.example"));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const result = await checkSiteLiveness("bad.example", { retryCount: 0 });
    expect(result.isLive).toBe(false);
    expect(result.errorCode).toBe("ENOTFOUND");
  });

  it("returns ECONNREFUSED for connection refused", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(makeNetworkError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:443"));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0 });
    expect(result.isLive).toBe(false);
    expect(result.errorCode).toBe("ECONNREFUSED");
  });

  it("falls back from HTTPS to HTTP on SSL error", async () => {
    const sslError = new Error("SSL certificate verification failed");
    const fetchMock = vi.fn();
    // HTTPS attempt fails with SSL error, HTTP attempt succeeds
    fetchMock
      .mockRejectedValueOnce(sslError)
      .mockResolvedValueOnce(mockResponse(200, "http://example.com"));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const result = await checkSiteLiveness("example.com", { retryCount: 0 });
    expect(result.isLive).toBe(true);
    expect(result.httpStatus).toBe(200);
  });
});
