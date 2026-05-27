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
