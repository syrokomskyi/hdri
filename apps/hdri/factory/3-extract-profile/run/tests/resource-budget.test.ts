import { describe, expect, it } from "vitest";
import { DomCache } from "../services/dom-cache.js";

describe("profile extraction resource budget", () => {
  it("rejects disabled, unbounded and excessive DOM caches", () => {
    expect(() => new DomCache(0)).toThrow(/between 1 and 64/);
    expect(() => new DomCache(-1)).toThrow(/between 1 and 64/);
    expect(() => new DomCache(65)).toThrow(/between 1 and 64/);
    expect(() => new DomCache(16)).not.toThrow();
  });
});
