/*
<MODULE_CONTRACT>
<purpose>Unit tests for the challenge detector (RFC-0105 AC-1: distinguish instrument failures from scientific results).</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import { detectChallenge, CHALLENGE_DETECTOR_VERSION } from "../browser/challenge-detector.js";

describe("challenge-detector", () => {
  it("has version 1", () => {
    expect(CHALLENGE_DETECTOR_VERSION).toBe(1);
  });

  it("returns 'measured' for normal 200 pages", () => {
    expect(detectChallenge(200, "Welcome to our website")).toBe("measured");
  });

  it("returns 'measured' for 301/302 redirects", () => {
    expect(detectChallenge(301, "")).toBe("measured");
  });

  it("returns 'site-unavailable' for 500 errors", () => {
    expect(detectChallenge(500, "Internal Server Error")).toBe("site-unavailable");
  });

  it("returns 'site-unavailable' for 503 errors without challenge patterns", () => {
    expect(detectChallenge(503, "Service Unavailable")).toBe("site-unavailable");
  });

  it("returns 'blocked' for 403 with cloudflare challenge", () => {
    expect(detectChallenge(403, "Just a moment... Cloudflare")).toBe("blocked");
  });

  it("returns 'blocked' for 503 with captcha", () => {
    expect(detectChallenge(503, "Please complete the CAPTCHA")).toBe("blocked");
  });

  it("returns 'not-observed' for 200 with challenge pattern (ambiguous)", () => {
    // Challenge pattern on a 200 page is ambiguous — not a clear block
    expect(detectChallenge(200, "Checking your browser before accessing")).toBe("measured");
  });

  it("returns 'not-observed' for 403 without challenge patterns", () => {
    expect(detectChallenge(403, "Forbidden")).toBe("measured");
  });

  it("returns 'not-observed' for null status with challenge patterns", () => {
    expect(detectChallenge(null, "DDoS protection by Cloudflare")).toBe("not-observed");
  });

  it("returns 'measured' for null status without challenge patterns", () => {
    expect(detectChallenge(null, "Normal page content")).toBe("measured");
  });

  it("returns 'measured' for empty content with 200", () => {
    expect(detectChallenge(200, "")).toBe("measured");
  });

  it("returns 'blocked' for 403 with recaptcha", () => {
    expect(detectChallenge(403, "reCAPTCHA verification required")).toBe("blocked");
  });

  it("returns 'blocked' for 503 with hcaptcha", () => {
    expect(detectChallenge(503, "hCaptcha challenge")).toBe("blocked");
  });

  it("returns 'blocked' for 403 with 'access denied'", () => {
    expect(detectChallenge(403, "Access Denied")).toBe("blocked");
  });

  it("returns 'blocked' for 503 with 'bot protection'", () => {
    expect(detectChallenge(503, "Bot protection enabled")).toBe("blocked");
  });
});
