import { createHash } from 'node:crypto';
import type { LivenessCheckOptions } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageFetchSuccess = {
  ok: true;
  html: string;
  httpStatus: number;
  /** Final URL after following redirects. */
  finalUrl: string;
  latencyMs: number;
  /** SHA-256 of the raw HTML bytes (UTF-8 encoded). */
  contentHash: string;
  /** Byte length of the HTML string when UTF-8 encoded. */
  contentLengthBytes: number;
};

export type PageFetchFailure = {
  ok: false;
  html: null;
  httpStatus: number | null;
  finalUrl: string | null;
  latencyMs: number;
  errorCode: string;
  errorMsg: string;
};

export type PageFetchResult = PageFetchSuccess | PageFetchFailure;

export type PageFetchOptions = LivenessCheckOptions & {
  /** Max response body size in bytes. Default: 1 MiB. */
  maxBytes?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 1_024 * 1_024; // 1 MiB
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; site-profile/1.0)';

// ---------------------------------------------------------------------------
// Internal error classifier (mirrors liveness.ts for consistency)
// ---------------------------------------------------------------------------

const classifyFetchError = (err: unknown, timedOut: boolean): { errorCode: string; errorMsg: string } => {
  const causeCode = (err instanceof Error && err.cause != null)
    ? String((err.cause as { code?: string }).code ?? '')
    : '';
  const causeMsg = (err instanceof Error && err.cause instanceof Error)
    ? err.cause.message.slice(0, 500)
    : '';
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const fullMsg = causeMsg || msg;
  const upper = fullMsg.toUpperCase();

  if (timedOut || causeCode === 'ERR_OPERATION_ABORTED') return { errorCode: 'TIMEOUT', errorMsg: fullMsg };
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') return { errorCode: 'ENOTFOUND', errorMsg: fullMsg };
  if (causeCode === 'ECONNREFUSED') return { errorCode: 'ECONNREFUSED', errorMsg: fullMsg };
  if (causeCode === 'ETIMEDOUT') return { errorCode: 'ETIMEDOUT', errorMsg: fullMsg };
  if (upper.includes('SSL') || upper.includes('TLS') || upper.includes('CERT')) return { errorCode: 'SSL_ERROR', errorMsg: fullMsg };
  return { errorCode: 'UNKNOWN', errorMsg: fullMsg };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches a page via HTTP GET and returns its HTML content together with
 * provenance metadata (status, finalUrl, SHA-256 hash).
 *
 * Key differences from `checkSiteLiveness`:
 *  - Uses GET (not HEAD) — we need the response body.
 *  - Larger default timeout (20 s vs 10 s) — full-page fetches take longer.
 *  - No HTTPS→HTTP scheme fallback — caller controls which URL to try.
 *  - Does NOT retry automatically — caller decides retry strategy.
 *
 * The returned `contentHash` is the SHA-256 of the HTML bytes (truncated to
 * `maxBytes` if the response was larger). Use it as the CAS key when storing
 * page content on disk.
 */
export const fetchPageContent = async (
  url: string,
  options: PageFetchOptions = {},
): Promise<PageFetchResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': userAgent },
    });

    const buf = await response.arrayBuffer();
    const truncated = buf.slice(0, maxBytes);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(truncated);
    const htmlBytes = Buffer.from(html, 'utf-8');

    const contentHash = createHash('sha256').update(htmlBytes).digest('hex');
    const latencyMs = Date.now() - start;

    return {
      ok: true,
      html,
      httpStatus: response.status,
      finalUrl: response.url || url,
      latencyMs,
      contentHash,
      contentLengthBytes: htmlBytes.length,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = controller.signal.aborted;
    const { errorCode, errorMsg } = classifyFetchError(err, timedOut);
    return {
      ok: false,
      html: null,
      httpStatus: null,
      finalUrl: null,
      latencyMs,
      errorCode,
      errorMsg,
    };
  } finally {
    clearTimeout(timer);
  }
};
