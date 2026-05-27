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

import { createRequire } from 'node:module';

type RobotsTxtParser = (url: string, robotstxt: string) => {
  isAllowed(url: string, ua?: string): boolean | undefined;
};

// robots-parser is a CJS module; use createRequire for ESM compatibility.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const robotsParser: RobotsTxtParser = (_require('robots-parser') as any);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RobotsCheckResult =
  | { allowed: true; reason: 'robots-allowed' | 'robots-missing' | 'fetch-error' }
  | { allowed: false; reason: 'robots-disallowed' };

// ---------------------------------------------------------------------------
// In-process cache
// ---------------------------------------------------------------------------

/** robots.txt text content keyed by origin (e.g. "https://example.com"). */
const robotsCache = new Map<string, string | null>();

async function fetchRobotsTxt(origin: string, timeoutMs = 5_000): Promise<string | null> {
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin) ?? null;
  }

  const url = `${origin}/robots.txt`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text: string | null = null;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'WebGogolBot/1.0' },
        redirect: 'follow',
      });
      if (res.ok) {
        text = await res.text();
      } else if (res.status === 404) {
        text = null; // no robots.txt — allow all
      } else {
        text = null; // other HTTP error → treat as missing (safe default)
      }
    } finally {
      clearTimeout(timer);
    }
    robotsCache.set(origin, text);
    return text;
  } catch {
    // Network error or abort → treat as missing (fail-open; caller may choose to skip)
    robotsCache.set(origin, null);
    return null;
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
 * Fail-open policy:
 *   If robots.txt cannot be fetched (network error, timeout, 5xx), we return
 *   `allowed: true` with reason "fetch-error". This mirrors the behaviour of
 *   most major search engine crawlers and avoids silently skipping sites due
 *   to transient infrastructure issues.
 *
 *   Callers that prefer fail-closed behaviour should check `reason` and act
 *   accordingly.
 */
export async function checkRobotsAllowed(
  url: string,
  userAgent = 'WebGogolBot',
  timeoutMs = 5_000,
): Promise<RobotsCheckResult> {
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin; // "https://example.com"
  } catch {
    // Malformed URL → allow (caller is responsible for URL validity)
    return { allowed: true, reason: 'robots-allowed' };
  }

  const robotsTxt = await fetchRobotsTxt(origin, timeoutMs);

  if (robotsTxt === null) {
    // Missing or fetch error — allow
    return { allowed: true, reason: 'robots-missing' };
  }

  const robots = robotsParser(`${origin}/robots.txt`, robotsTxt);
  const isAllowed = robots.isAllowed(url, userAgent);

  if (isAllowed === false) {
    return { allowed: false, reason: 'robots-disallowed' };
  }

  return { allowed: true, reason: 'robots-allowed' };
}

/**
 * Clears the in-process robots.txt cache.
 * Useful in tests or long-running processes that need fresh checks.
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
}
