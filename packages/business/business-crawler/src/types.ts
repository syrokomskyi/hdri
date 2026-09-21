/*
<MODULE_CONTRACT>
<purpose>This module defines types for performing and handling HTTP liveness checks, including options for retries and concurrency.</purpose>
<non-goals>
  <item>This module does not perform the actual HTTP requests or liveness checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of types for liveness check results and options.</item>
  <item>RFC-0114 review: version HTTP evidence for explicit entity-byte accounting without claiming compressed transfer measurements.</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// LivenessResult
// ---------------------------------------------------------------------------

/**
 * Result of a single HTTP liveness check for one domain.
 *
 * Mirrors the liveness_checks DB row (minus the DB-managed id/checked_at).
 */
export type LivenessResult = {
  domain: string;
  /** HTTP status returned by the server. Null if no response was received. */
  httpStatus: number | null;
  /**
   * Final URL after redirect chain (null if no redirects occurred or no
   * response was received). Useful for detecting bare→www upgrades, http→https
   * upgrades, and domain aliases.
   */
  finalUrl: string | null;
  /** Number of HTTP redirects followed (0 if none). */
  redirectCount: number;
  /** Round-trip latency from first byte sent to last byte received, in ms. */
  latencyMs: number;
  /**
   * true  — server responded with HTTP status < 500 (reachable site, even if
   *         it returns 4xx client errors — those indicate config issues, not
   *         a dead server).
   * false — network failure, timeout, SSL error, or 5xx server error.
   */
  isLive: boolean;
  /**
   * Short categorical error code when isLive = false:
   *  'ENOTFOUND'     — DNS resolution failed
   *  'ECONNREFUSED'  — server actively refused the connection
   *  'ETIMEDOUT'     — TCP connect timed out
   *  'TIMEOUT'       — request timed out after connection (read timeout)
   *  'SSL_ERROR'     — TLS/SSL handshake or certificate error
   *  'REDIRECT_LOOP' — too many redirects (> 20 on Node.js default)
   *  'HTTP_5XX'      — server responded with 5xx (server-side error)
   *  'UNKNOWN'       — anything else
   */
  errorCode: string | null;
  /** Raw error message, truncated to 500 chars. Null if isLive = true. */
  errorMsg: string | null;
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type LivenessCheckOptions = {
  /** Per-request timeout in milliseconds. Default: 10 000. */
  timeoutMs?: number;
  /**
   * Number of retry attempts on transient network failures.
   * 0 = no retries; 1 = one retry after first failure. Default: 1.
   */
  retryCount?: number;
  /** User-Agent header sent with every request. */
  userAgent?: string;
};

export type BatchCheckOptions = LivenessCheckOptions & {
  /** Max parallel checks in flight at one time. Default: 5. */
  concurrency?: number;
  /** Called after each individual check completes. */
  onProgress?: (result: LivenessResult, index: number, total: number) => void;
};

// ---------------------------------------------------------------------------
// RFC-0103: Bounded HTTP acquisition contracts
// ---------------------------------------------------------------------------

export interface FetchEndpoint {
  assetId: string;
  sourceUrl: string;
  canonicalDomain: string;
  effectiveUrl: string;
  redirectChain: string[];
}

export interface HttpEvidence {
  schema: "hdri-http-evidence@2";
  measuredAt: string;
  endpoint: FetchEndpoint;
  outcome: "reachable" | "unavailable" | "blocked" | "indeterminate";
  failureOwner: "site" | "collector" | "policy" | null;
  status: number | null;
  bodySha256: string | null;
  /** Body bytes after content decoding, before charset conversion; not wire traffic. */
  entityBytes: number;
  decodedBytes: number;
  complete: boolean;
  charset: string | null;
  robotsDecisionSha256: string | null;
  policySha256: string;
}

export type RobotsDecision =
  | {
      decision: "absent";
      sha256: null;
      status: number | null;
      retrievedAt: string;
      userAgent: string;
    }
  | {
      decision: "disallowed";
      sha256: string;
      status: number;
      retrievedAt: string;
      userAgent: string;
    }
  | {
      decision: "unavailable";
      sha256: null;
      status: number | null;
      retrievedAt: string;
      userAgent: string;
    }
  | { decision: "allowed"; sha256: string; status: number; retrievedAt: string; userAgent: string };

export interface EgressPolicy {
  denyPrivateAddresses: boolean;
  denyLoopback: boolean;
  denyLinkLocal: boolean;
  denyMulticast: boolean;
  denyReserved: boolean;
  denyMetadata: boolean;
  includeIpv6: boolean;
}

export interface CollectorHealth {
  sentinelFailures: number;
  consecutiveSentinelFailures: number;
  totalAttempts: number;
  collectorOwnedFailures: number;
  isPaused: boolean;
  /** Internal counter for consecutive successes while paused. Not part of the public API. */
  _resumeSuccesses?: number;
}
