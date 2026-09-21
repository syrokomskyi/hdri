/*
<MODULE_CONTRACT>
<purpose>This module fetches HTML content from a given URL using HTTP GET and provides metadata such as status, final URL, and content hash.</purpose>
<non-goals>
  <item>This module does not handle automatic retries or HTTPS to HTTP fallback.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of page content fetching with error classification.</item>
  <item>RFC-0114 review: hash stored UTF-8 bytes, distinguish entity data from transfer bytes, and truncate at character boundaries.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { LivenessCheckOptions } from "./types.js";
import { classifyError } from "./error-codes.js";

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
  /** SHA-256 of precisely Buffer.from(html, "utf8"), including any declared truncation. */
  contentHash: string;
  representation: "utf8-html";
  /** Digest of the bounded HTTP entity before charset conversion, not compressed transfer bytes. */
  entitySha256: string;
  /** Byte length of the HTML string when UTF-8 encoded. */
  contentLengthBytes: number;
  /** Body bytes exposed by fetch after transfer/content decoding, before charset conversion. */
  entityBytes: number;
  /** True if the entire body was read within limits; false if truncated. */
  complete: boolean;
  /** Detected charset from headers/BOM/declared, null if unknown. */
  charset: string | null;
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
  /** Max raw entity bytes to read. Default: 2 MiB. */
  maxEntityBytes?: number;
  /** Max decoded bytes after charset conversion. Default: 4 MiB. */
  maxDecodedBytes?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ENTITY_BYTES = 2 * 1_024 * 1_024; // 2 MiB
const DEFAULT_MAX_DECODED_BYTES = 4 * 1_024 * 1_024; // 4 MiB
const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; site-profile/1.0)";

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
 * `contentHash` identifies exactly the returned HTML serialized as UTF-8 for CAS.
 * `entitySha256` identifies the bounded pre-charset body. Native fetch has already
 * decoded content encodings, so neither field claims to identify compressed wire bytes.
 */
export const fetchPageContent = async (
  url: string,
  options: PageFetchOptions = {},
): Promise<PageFetchResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxEntityBytes = options.maxEntityBytes ?? DEFAULT_MAX_ENTITY_BYTES;
  const maxDecodedBytes = options.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  for (const limit of [timeoutMs, maxEntityBytes, maxDecodedBytes]) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("INVALID_FETCH_LIMIT");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });

    // Bounded streaming: read in chunks, abort when wire byte limit exceeded.
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const entityChunks: Uint8Array[] = [];
    let entityBytes = 0;
    let complete = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        entityBytes += value.length;
        if (entityBytes > maxEntityBytes) {
          entityChunks.push(value.subarray(0, maxEntityBytes - (entityBytes - value.length)));
          entityBytes = maxEntityBytes;
          complete = false;
          await reader.cancel();
          break;
        }
        entityChunks.push(value);
      }
    }

    const entityBuf = Buffer.concat(entityChunks);
    const charset =
      response.headers
        .get("content-type")
        ?.match(/charset\s*=\s*["']?([^"'\s;]+)/i)?.[1]
        ?.toLowerCase() ?? null;
    const decoder = new TextDecoder(charset ?? "utf-8", { fatal: false });
    const decoded = decoder.decode(entityBuf);
    let decodedBytes = Buffer.byteLength(decoded, "utf-8");
    let html = decoded;
    if (decodedBytes > maxDecodedBytes) {
      const encoded = Buffer.from(decoded, "utf8");
      let boundary = maxDecodedBytes;
      while (boundary > 0 && (encoded[boundary]! & 0xc0) === 0x80) boundary--;
      html = encoded.subarray(0, boundary).toString("utf8");
      decodedBytes = boundary;
      complete = false;
    }

    const entitySha256 = createHash("sha256").update(entityBuf).digest("hex");
    const contentHash = createHash("sha256").update(html, "utf8").digest("hex");
    const latencyMs = Date.now() - start;

    return {
      ok: true,
      html,
      httpStatus: response.status,
      finalUrl: response.url || url,
      latencyMs,
      contentHash,
      representation: "utf8-html",
      entitySha256,
      contentLengthBytes: decodedBytes,
      entityBytes,
      complete,
      charset,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = controller.signal.aborted;
    const { errorCode, errorMsg } = classifyError(err, timedOut);
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
