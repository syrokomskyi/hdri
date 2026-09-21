import { describe, it, expect } from "vitest";
import { normaliseDomain, normaliseDomainOrThrow } from "../ids/domain-normalizer.js";
import { STOP_DOMAINS, isStopDomain } from "../ids/stop-domains.js";
import { makeScoringRunId, makePublicationRunId } from "../ids/batch-ids.js";

describe("normaliseDomain", () => {
  it("normalises a simple domain", () => {
    expect(normaliseDomain("example.com")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(normaliseDomain("www.example.com")).toBe("example.com");
  });

  it("lowercases the domain", () => {
    expect(normaliseDomain("Example.COM")).toBe("example.com");
  });

  it("strips trailing dots", () => {
    expect(normaliseDomain("example.com.")).toBe("example.com");
  });

  it("strips whitespace", () => {
    expect(normaliseDomain("  example.com  ")).toBe("example.com");
  });

  it("handles URLs with scheme", () => {
    expect(normaliseDomain("https://www.example.com/path")).toBe("example.com");
    expect(normaliseDomain("http://example.com")).toBe("example.com");
  });

  it("returns null for empty string", () => {
    expect(normaliseDomain("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normaliseDomain("   ")).toBeNull();
  });

  it("returns null for bare label (no dot)", () => {
    expect(normaliseDomain("localhost")).toBeNull();
  });

  it("returns null for IP address", () => {
    expect(normaliseDomain("192.168.1.1")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(normaliseDomain("not a url")).toBeNull();
  });
});

describe("normaliseDomainOrThrow", () => {
  it("returns normalised domain for valid input", () => {
    expect(normaliseDomainOrThrow("www.example.com")).toBe("example.com");
  });

  it("throws for invalid input", () => {
    expect(() => normaliseDomainOrThrow("")).toThrow('Cannot normalise domain from: ""');
    expect(() => normaliseDomainOrThrow("localhost")).toThrow();
  });
});

describe("STOP_DOMAINS", () => {
  it("contains known aggregators", () => {
    expect(STOP_DOMAINS.has("facebook.com")).toBe(true);
    expect(STOP_DOMAINS.has("google.com")).toBe(true);
    expect(STOP_DOMAINS.has("yelp.de")).toBe(true);
  });
});

describe("isStopDomain", () => {
  it("returns true for exact match", () => {
    expect(isStopDomain("facebook.com")).toBe(true);
  });

  it("returns true for subdomain of stop domain", () => {
    expect(isStopDomain("m.facebook.com")).toBe(true);
    expect(isStopDomain("business.facebook.com")).toBe(true);
  });

  it("returns false for non-stop domain", () => {
    expect(isStopDomain("my-business.de")).toBe(false);
  });

  it("returns false for domain that contains but is not a stop domain", () => {
    expect(isStopDomain("facebook.com.evil.com")).toBe(false);
  });
});

describe("makeScoringRunId", () => {
  it("produces ID in format scoring-{year}-{version}-{sha6}", () => {
    const id = makeScoringRunId(2026, "v1.0", "batch-token");
    expect(id).toMatch(/^scoring-2026-v1\.0-[a-f0-9]{6}$/);
  });

  it("is deterministic for same inputs", () => {
    const id1 = makeScoringRunId(2026, "v1.0", "token");
    const id2 = makeScoringRunId(2026, "v1.0", "token");
    expect(id1).toBe(id2);
  });

  it("differs for different tokens", () => {
    const id1 = makeScoringRunId(2026, "v1.0", "token-a");
    const id2 = makeScoringRunId(2026, "v1.0", "token-b");
    expect(id1).not.toBe(id2);
  });
});

describe("makePublicationRunId", () => {
  it("produces ID in format pub-{year}-{sha6}", () => {
    const id = makePublicationRunId("2026", "pub-token");
    expect(id).toMatch(/^pub-2026-[a-f0-9]{6}$/);
  });

  it("is deterministic for same inputs", () => {
    const id1 = makePublicationRunId("2026", "token");
    const id2 = makePublicationRunId("2026", "token");
    expect(id1).toBe(id2);
  });
});
