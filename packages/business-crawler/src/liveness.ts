import type { LivenessCheckOptions, LivenessResult } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; site-liveness/1.0)';
const RETRY_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

type ErrorInfo = { errorCode: string; errorMsg: string };

const classifyError = (err: unknown, timedOut: boolean): ErrorInfo => {
  // Node.js fetch wraps the real network error in TypeError.cause.
  // Check cause.code first for the most reliable classification.
  const causeCode = (err instanceof Error && err.cause != null)
    ? String((err.cause as { code?: string }).code ?? '')
    : '';
  const causeMsg = (err instanceof Error && err.cause instanceof Error)
    ? err.cause.message.slice(0, 500)
    : '';

  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const fullMsg = causeMsg || msg;

  if (timedOut || causeCode === 'ERR_OPERATION_ABORTED' || msg.includes('abort') || msg.includes('AbortError')) {
    return { errorCode: 'TIMEOUT', errorMsg: fullMsg };
  }
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') {
    return { errorCode: 'ENOTFOUND', errorMsg: fullMsg };
  }
  if (causeCode === 'ECONNREFUSED') {
    return { errorCode: 'ECONNREFUSED', errorMsg: fullMsg };
  }
  if (causeCode === 'ETIMEDOUT' || causeCode === 'ESOCKETTIMEDOUT') {
    return { errorCode: 'ETIMEDOUT', errorMsg: fullMsg };
  }

  const upper = fullMsg.toUpperCase();
  if (upper.includes('ENOTFOUND') || upper.includes('DNS')) {
    return { errorCode: 'ENOTFOUND', errorMsg: fullMsg };
  }
  if (upper.includes('ECONNREFUSED')) {
    return { errorCode: 'ECONNREFUSED', errorMsg: fullMsg };
  }
  if (upper.includes('ETIMEDOUT') || upper.includes('CONNECT TIMED OUT')) {
    return { errorCode: 'ETIMEDOUT', errorMsg: fullMsg };
  }
  if (
    upper.includes('SSL') ||
    upper.includes('TLS') ||
    upper.includes('CERTIFICATE') ||
    upper.includes('CERT_') ||
    upper.includes('ERR_CERT')
  ) {
    return { errorCode: 'SSL_ERROR', errorMsg: fullMsg };
  }
  if (upper.includes('REDIRECT') || upper.includes('TOO MANY REDIRECT')) {
    return { errorCode: 'REDIRECT_LOOP', errorMsg: fullMsg };
  }
  return { errorCode: 'UNKNOWN', errorMsg: fullMsg };
};

// ---------------------------------------------------------------------------
// Single-URL attempt
// ---------------------------------------------------------------------------

type AttemptResult =
  | { ok: true; httpStatus: number; finalUrl: string | null; redirectCount: number; latencyMs: number }
  | { ok: false; errorCode: string; errorMsg: string; latencyMs: number };

const attemptUrl = async (
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<AttemptResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    // HEAD first — minimal bandwidth
    let response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': userAgent },
      // Node.js fetch follows redirects by default (up to 20)
    });

    // Some servers reject HEAD — fall back to GET
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
      });
      // Discard body to release socket
      try { await response.body?.cancel(); } catch { /* ignore */ }
    }

    const latencyMs = Date.now() - start;
    const finalUrl = response.url !== url ? response.url : null;
    // Approximate redirect count: 0 or 1 (we can't get the exact chain from fetch)
    const redirectCount = finalUrl !== null ? 1 : 0;

    return { ok: true, httpStatus: response.status, finalUrl, redirectCount, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = controller.signal.aborted;
    const { errorCode, errorMsg } = classifyError(err, timedOut);
    return { ok: false, errorCode, errorMsg, latencyMs };
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether a domain is HTTP-reachable.
 *
 * Strategy:
 *  1. Try `https://{domain}` with a HEAD request (falls back to GET on 405).
 *  2. If HTTPS fails for any reason (network error, SSL error, timeout),
 *     try `http://{domain}` — many German SMB sites are HTTP-only or have
 *     broken/self-signed TLS certificates, so always trying http:// is safer
 *     than guessing from the error type.
 *  3. Retry each scheme up to `retryCount` times on transient failures before
 *     moving on to the next scheme.
 *
 * "isLive" definition:
 *  - true  if any scheme responded with HTTP status < 500
 *  - false for 5xx, DNS failure, connection refused, and timeouts
 */
export const checkSiteLiveness = async (
  domain: string,
  options: LivenessCheckOptions = {},
): Promise<LivenessResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const schemes: Array<'https' | 'http'> = ['https', 'http'];

  let lastResult: AttemptResult | null = null;

  for (const scheme of schemes) {
    const url = `${scheme}://${domain}`;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const result = await attemptUrl(url, timeoutMs, userAgent);
      lastResult = result;

      if (result.ok) {
        // Got a real HTTP response — accept it immediately.
        const isLive = result.httpStatus < 500;
        return {
          domain,
          httpStatus: result.httpStatus,
          finalUrl: result.finalUrl,
          redirectCount: result.redirectCount,
          latencyMs: result.latencyMs,
          isLive,
          errorCode: isLive ? null : 'HTTP_5XX',
          errorMsg: isLive ? null : `HTTP ${result.httpStatus}`,
        };
      }

      // Network-level failure — retry if attempts remain.
      if (attempt < retryCount) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    // HTTPS failed — fall through to http:// on next loop iteration.
  }

  // All attempts failed
  const err = lastResult as Extract<AttemptResult, { ok: false }>;
  return {
    domain,
    httpStatus: null,
    finalUrl: null,
    redirectCount: 0,
    latencyMs: err?.latencyMs ?? 0,
    isLive: false,
    errorCode: err?.errorCode ?? 'UNKNOWN',
    errorMsg: err?.errorMsg ?? 'All attempts failed',
  };
};
