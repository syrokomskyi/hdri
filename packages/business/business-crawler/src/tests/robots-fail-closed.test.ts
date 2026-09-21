import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRobotsAllowed, getRobotsDecision, clearRobotsCache } from "../robots-honor.js";

describe("robots-honor — fail-closed (RFC-0103)", () => {
  beforeEach(() => {
    clearRobotsCache();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearRobotsCache();
  });

  it("allows when robots.txt is 404 (absent)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 404,
      ok: false,
      text: async () => "",
      headers: new Map(),
    });

    const result = await checkRobotsAllowed("https://example.com/page");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("robots-absent");
  });

  it("allows when robots.txt is 410 (absent)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 410,
      ok: false,
      text: async () => "",
      headers: new Map(),
    });

    const result = await checkRobotsAllowed("https://example.com/page");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("robots-absent");
  });

  it("blocks when robots.txt fetch returns 503 (unavailable)", async () => {
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

  it("blocks when robots.txt fetch throws network error (unavailable)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

    const result = await checkRobotsAllowed("https://example.com/page");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("robots-unavailable");
  });

  it("blocks when robots.txt disallows the URL", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "User-agent: *\nDisallow: /private",
      headers: new Map(),
    });

    const result = await checkRobotsAllowed("https://example.com/private");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("robots-disallowed");
  });

  it("allows when robots.txt permits the URL", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "User-agent: *\nAllow: /",
      headers: new Map(),
    });

    const result = await checkRobotsAllowed("https://example.com/page");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("robots-allowed");
  });
});

describe("getRobotsDecision — full decision with metadata (RFC-0103)", () => {
  beforeEach(() => {
    clearRobotsCache();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearRobotsCache();
  });

  it("returns absent decision with null sha256 for 404", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 404,
      ok: false,
      text: async () => "",
      headers: new Map(),
    });

    const decision = await getRobotsDecision("https://example.com/page");
    expect(decision.decision).toBe("absent");
    expect(decision.sha256).toBeNull();
    expect(decision.status).toBe(404);
  });

  it("returns unavailable decision with null sha256 for 503", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 503,
      ok: false,
      text: async () => "",
      headers: new Map(),
    });

    const decision = await getRobotsDecision("https://example.com/page");
    expect(decision.decision).toBe("unavailable");
    expect(decision.sha256).toBeNull();
    expect(decision.status).toBe(503);
  });

  it("returns allowed decision with sha256 for 200 with Allow: /", async () => {
    const robotsText = "User-agent: *\nAllow: /";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => robotsText,
      headers: new Map(),
    });

    const decision = await getRobotsDecision("https://example.com/page");
    expect(decision.decision).toBe("allowed");
    if (decision.decision === "allowed") {
      expect(decision.sha256).toHaveLength(64);
      expect(decision.status).toBe(200);
    }
  });

  it("returns disallowed decision with sha256 for 200 with Disallow: /", async () => {
    const robotsText = "User-agent: *\nDisallow: /";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => robotsText,
      headers: new Map(),
    });

    const decision = await getRobotsDecision("https://example.com/page");
    expect(decision.decision).toBe("disallowed");
    if (decision.decision === "disallowed") {
      expect(decision.sha256).toHaveLength(64);
      expect(decision.status).toBe(200);
    }
  });
});
