/*
<MODULE_CONTRACT>
<purpose>This module fetches and caches robots.txt files to check if a given URL is allowed for crawling by a specific user-agent, ensuring compliance with DSGVO and site operators' access policies.</purpose>
<non-goals>
  <item>This module does not provide persistent caching solutions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of robots.txt fetching and caching logic.</item>
</CHANGE_SUMMARY>
*/

/**
 * robots-honor — DSGVO/robots.txt compliance helper.
 *
 * Fetches and caches robots.txt for a given origin, then checks whether
 * a given URL is allowed for our crawler user-agent.
 *
 * Uses `robots-parser` from npm (RFC 9309-compliant, actively maintained).
 *
 * Cache: in-memory, scoped to the process lifetime. Each origin is fetched
 * at most once per process run. For persistent caching use the caller's DB.
 *
 * DSGVO relevance:
 *   robots.txt is a signal of the site operator's intent regarding automated
 *   access. Honoring it is both a legal best-practice (BGH "Metall auf Metall"
 *   line of cases) and an explicit requirement of our data-collection policy.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { RobotsDecision } from "./types.js";

type RobotsTxtParser = (
  url: string,
  robotstxt: string,
) => {
  isAllowed(url: string, ua?: string): boolean | undefined;
};

// robots-parser is a CJS module; use createRequire for ESM compatibility.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const robotsParser: RobotsTxtParser = _require("robots-parser") as any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RobotsCheckResult =
  | { allowed: true; reason: "robots-allowed" | "robots-absent" }
  | { allowed: false; reason: "robots-disallowed" | "robots-unavailable" };

export type RobotsFetchResult =
  | { kind: "fetched"; text: string; status: number; sha256: string }
  | { kind: "absent"; status: number; sha256: null }
  | { kind: "unavailable"; status: number | null; sha256: null };

// ---------------------------------------------------------------------------
// In-process cache
// ---------------------------------------------------------------------------

/** robots.txt fetch result keyed by origin (e.g. "https://example.com"). */
const robotsCache = new Map<string, RobotsFetchResult>();

async function fetchRobotsTxt(
  origin: string,
  timeoutMs = 5_000,
  userAgent = "WebGogolBot/1.0",
): Promise<RobotsFetchResult> {
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin) ?? { kind: "absent", status: 404, sha256: null };
  }

  const url = `${origin}/robots.txt`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let result: RobotsFetchResult;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": userAgent },
        redirect: "follow",
      });
      if (res.ok) {
        const text = await res.text();
        const sha256 = createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");
        result = { kind: "fetched", text, status: res.status, sha256 };
      } else if (res.status === 404 || res.status === 410) {
        result = { kind: "absent", status: res.status, sha256: null };
      } else {
        // 5xx and other errors → unavailable (fail-closed)
        result = { kind: "unavailable", status: res.status, sha256: null };
      }
    } finally {
      clearTimeout(timer);
    }
    robotsCache.set(origin, result);
    return result;
  } catch {
    // Network error or abort → unavailable (fail-closed, not missing)
    const result: RobotsFetchResult = { kind: "unavailable", status: null, sha256: null };
    robotsCache.set(origin, result);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether crawling `url` is permitted by the site's robots.txt.
 *
 * @param url       Full URL to check (e.g. "https://example.com/page")
 * @param userAgent Our crawler's user-agent token (default: "WebGogolBot")
 * @param timeoutMs Timeout for fetching robots.txt (default: 5000 ms)
 *
 * Fail-closed policy (RFC-0103):
 *   404/410 → absent (allowed)
 *   Network error / 5xx → unavailable (deferred, NOT allowed)
 *   200 with disallow rule → disallowed
 *   200 with allow → allowed
 */
export async function checkRobotsAllowed(
  url: string,
  userAgent = "WebGogolBot",
  timeoutMs = 5_000,
): Promise<RobotsCheckResult> {
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
  } catch {
    // Malformed URL → allow (caller is responsible for URL validity)
    return { allowed: true, reason: "robots-allowed" };
  }

  const fetchResult = await fetchRobotsTxt(origin, timeoutMs, `${userAgent}/1.0`);

  if (fetchResult.kind === "absent") {
    return { allowed: true, reason: "robots-absent" };
  }

  if (fetchResult.kind === "unavailable") {
    return { allowed: false, reason: "robots-unavailable" };
  }

  const robots = robotsParser(`${origin}/robots.txt`, fetchResult.text);
  const isAllowed = robots.isAllowed(url, userAgent);

  if (isAllowed === false) {
    return { allowed: false, reason: "robots-disallowed" };
  }

  return { allowed: true, reason: "robots-allowed" };
}

/**
 * Returns the full robots decision with SHA-256 and metadata (RFC-0103).
 */
export async function getRobotsDecision(
  url: string,
  userAgent = "WebGogolBot",
  timeoutMs = 5_000,
): Promise<RobotsDecision> {
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
  } catch {
    return {
      decision: "absent",
      sha256: null,
      status: null,
      retrievedAt: new Date().toISOString(),
      userAgent,
    };
  }

  const fetchResult = await fetchRobotsTxt(origin, timeoutMs, `${userAgent}/1.0`);
  const retrievedAt = new Date().toISOString();

  if (fetchResult.kind === "absent") {
    return {
      decision: "absent",
      sha256: null,
      status: fetchResult.status,
      retrievedAt,
      userAgent,
    };
  }

  if (fetchResult.kind === "unavailable") {
    return {
      decision: "unavailable",
      sha256: null,
      status: fetchResult.status,
      retrievedAt,
      userAgent,
    };
  }

  const robots = robotsParser(`${origin}/robots.txt`, fetchResult.text);
  const isAllowed = robots.isAllowed(url, userAgent);

  if (isAllowed === false) {
    return {
      decision: "disallowed",
      sha256: fetchResult.sha256,
      status: fetchResult.status,
      retrievedAt,
      userAgent,
    };
  }

  return {
    decision: "allowed",
    sha256: fetchResult.sha256,
    status: fetchResult.status,
    retrievedAt,
    userAgent,
  };
}

/**
 * Clears the in-process robots.txt cache.
 * Useful in tests or long-running processes that need fresh checks.
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
}
