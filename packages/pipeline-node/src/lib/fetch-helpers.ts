/*
<MODULE_CONTRACT>
<purpose>Provides robust HTTP fetching with automatic Playwright fallback for JS-heavy or protected pages.</purpose>
<keywords>fetch, playwright, fallback, http, crawling</keywords>
<responsibilities>
  <item>Fetch HTML content using native fetch as primary strategy.</item>
  <item>Automatically fall back to Playwright for cloudflare-protected or JS-rendered pages.</item>
  <item>Enforce timeout and size limits consistently across both strategies.</item>
  <item>Return uniform result type regardless of which strategy succeeded.</item>
</responsibilities>
<non-goals>
  <item>Do not parse or analyze HTML content.</item>
  <item>Do not manage caching or retry logic beyond the fallback mechanism.</item>
  <item>Do not handle authentication or session management.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="fetchPageHtml">Native fetch implementation with timeout.</entry>
  <entry key="fetchPageHtmlWithPlaywright">Playwright-based fetch for complex pages.</entry>
  <entry key="fetchWithFallback">Primary export: tries fetch, falls back to Playwright on specific failures.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation of fetch helpers with Playwright fallback for business-base pipeline.</item>
  <item>Add AbortSignal support for request cancellation.</item>
  <item>Add finalUrl tracking to capture post-redirect URL.</item>
</CHANGE_SUMMARY>
*/

import { chromium } from 'playwright';

export type FetchResult =
  | { html: string; httpStatus: number; strategy: 'fetch' | 'playwright'; finalUrl: string }
  | { error: string; httpStatus: number | null; strategy: 'fetch' | 'playwright'; finalUrl: string | null };

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; business-base-fetcher/1.0)';

/**
 * Determines if an error from native fetch warrants a Playwright fallback.
 * Typical cases: Cloudflare challenges, WAF blocks, heavy JS requirements.
 */
const shouldFallbackToPlaywright = (error: string, httpStatus: number | null): boolean => {
  // HTTP 403 often indicates Cloudflare/WAF protection
  if (httpStatus === 403) return true;
  // HTTP 503 with "cloudflare" in body (detected elsewhere) or typical CF status
  if (httpStatus === 503) return true;
  // Connection reset or refused may indicate protection
  if (error.includes('ECONNRESET') || error.includes('ECONNREFUSED')) return true;
  // SSL errors on otherwise valid sites
  if (error.includes('SSL') || error.includes('certificate')) return true;
  // Timeout on initial fetch - might be JS-heavy page
  if (error === 'timeout') return true;
  // Check for Cloudflare-specific indicators in error message
  if (error.toLowerCase().includes('cloudflare')) return true;
  if (error.toLowerCase().includes('checking your browser')) return true;
  return false;
};

/**
 * Fetch HTML using native fetch with timeout and size limits.
 */
export const fetchPageHtml = async (
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  // Combine external signal with internal timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal if provided
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': userAgent },
    });

    const buf = await response.arrayBuffer();
    const truncated = buf.slice(0, maxBytes);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(truncated);

    return { html, httpStatus: response.status, strategy: 'fetch', finalUrl: response.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const isExternalAbort = externalSignal?.aborted ?? false;
    return {
      error: isExternalAbort ? 'aborted' : (isTimeout ? 'timeout' : msg),
      httpStatus: null,
      strategy: 'fetch',
      finalUrl: null,
    };
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
};

/**
 * Fetch HTML using Playwright for JS-heavy or protected pages.
 * Launches headless Chromium, navigates to URL, waits for network idle.
 */
export const fetchPageHtmlWithPlaywright = async (
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const externalSignal = options.signal;

  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      userAgent,
      locale: 'en-US',
      extraHTTPHeaders: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'accept-language': 'en;q=0.9,*;q=0.5',
      },
    });

    const page = await context.newPage();

    try {
      // Handle external abort signal racing with page navigation
      const navigationPromise = page.goto(url, {
        waitUntil: 'networkidle',
        timeout: timeoutMs,
      });

      const abortPromise = externalSignal
        ? new Promise<never>((_, reject) => {
            externalSignal.addEventListener('abort', () => {
              reject(new Error('aborted'));
            }, { once: true });
          })
        : new Promise<never>(() => undefined);

      const response = await Promise.race([navigationPromise, abortPromise]);
      const statusCode = response?.status() ?? 0;
      const finalUrl = page.url();

      if (statusCode >= 400) {
        return {
          error: `HTTP ${statusCode}`,
          httpStatus: statusCode,
          strategy: 'playwright',
          finalUrl,
        };
      }

      const contentPromise = page.content();
      const racedContent = externalSignal
        ? Promise.race([
            contentPromise,
            new Promise<never>((_, reject) => {
              externalSignal.addEventListener('abort', () => {
                reject(new Error('aborted'));
              }, { once: true });
            }),
          ])
        : contentPromise;

      const html = await racedContent;
      const receivedBytes = Buffer.byteLength(html, 'utf8');

      if (receivedBytes > maxBytes) {
        return {
          html: html.slice(0, maxBytes),
          httpStatus: statusCode,
          strategy: 'playwright',
          finalUrl,
        };
      }

      return { html, httpStatus: statusCode, strategy: 'playwright', finalUrl };
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes('timeout');
    const isAbort = msg.toLowerCase().includes('aborted') || (externalSignal?.aborted ?? false);
    return {
      error: isAbort ? 'aborted' : (isTimeout ? 'timeout' : msg),
      httpStatus: null,
      strategy: 'playwright',
      finalUrl: null,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
};

/**
 * Primary fetch function: attempts native fetch first, falls back to Playwright
 * for suspected Cloudflare/WAF/JS-heavy pages.
 */
export const fetchWithFallback = async (
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> => {
  // Try native fetch first (fast path)
  const fetchResult = await fetchPageHtml(url, options);

  if ('html' in fetchResult) {
    // Success with native fetch
    return fetchResult;
  }

  // Check if we should try Playwright fallback
  if (shouldFallbackToPlaywright(fetchResult.error, fetchResult.httpStatus)) {
    console.log(`[fetch] Fallback to Playwright for ${url} (fetch failed: ${fetchResult.error})`);
    const playwrightResult = await fetchPageHtmlWithPlaywright(url, options);

    if ('html' in playwrightResult) {
      console.log(`[fetch] Playwright succeeded for ${url}`);
      return playwrightResult;
    }

    // Playwright also failed, return the original error but note both attempts
    console.log(`[fetch] Playwright also failed for ${url}: ${playwrightResult.error}`);
    return {
      error: `${fetchResult.error} (playwright fallback: ${playwrightResult.error})`,
      httpStatus: fetchResult.httpStatus ?? playwrightResult.httpStatus,
      strategy: 'playwright',
      finalUrl: null,
    };
  }

  // No fallback warranted, return the fetch error
  return fetchResult;
};
