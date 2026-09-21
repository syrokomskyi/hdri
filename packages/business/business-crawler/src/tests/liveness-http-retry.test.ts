import { afterEach, expect, it, vi } from "vitest";
import { checkSiteLiveness } from "../liveness.js";

afterEach(() => vi.unstubAllGlobals());

it("tries HTTP when HTTPS responds with a transient 503", async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", transport);
  const result = await checkSiteLiveness("business.test", { retryCount: 0 });
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    "https://business.test", "http://business.test",
  ]);
  expect(result.isLive).toBe(true);
  expect(result.finalUrl).toBe("http://business.test");
});

it("retries a transient response within the configured attempt budget", async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", transport);
  const result = await checkSiteLiveness("business.test", { retryCount: 1 });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]?.[0]).toBe("https://business.test");
  expect(result.isLive).toBe(true);
});

it("does not call a rate-limited site live after all bounded attempts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
  const result = await checkSiteLiveness("business.test", { retryCount: 0 });
  expect(result.isLive).toBe(false);
  expect(result.errorCode).toBe("HTTP_429");
});

it("retains the observed 503 when subsequent endpoint attempts have network failures", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockRejectedValueOnce(new Error("connection failed")));
  const result = await checkSiteLiveness("business.test", { retryCount: 0 });
  expect(result.httpStatus).toBe(503);
  expect(result.errorCode).toBe("HTTP_5XX");
});
