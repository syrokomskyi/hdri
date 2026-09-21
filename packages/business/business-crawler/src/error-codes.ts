/*
<MODULE_CONTRACT>
<purpose>Shared error classification for HTTP fetch and liveness checks.</purpose>
<non-goals>
  <item>This module does not perform network requests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from liveness.ts and fetch-page.ts for shared reuse (RFC-0103).</item>
</CHANGE_SUMMARY>
*/

export type ErrorInfo = { errorCode: string; errorMsg: string };

export const classifyError = (err: unknown, timedOut: boolean): ErrorInfo => {
  const causeCode =
    err instanceof Error && err.cause != null
      ? String((err.cause as { code?: string }).code ?? "")
      : "";
  const causeMsg =
    err instanceof Error && err.cause instanceof Error ? err.cause.message.slice(0, 500) : "";

  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const fullMsg = causeMsg || msg;

  if (
    timedOut ||
    causeCode === "ERR_OPERATION_ABORTED" ||
    msg.includes("abort") ||
    msg.includes("AbortError")
  ) {
    return { errorCode: "TIMEOUT", errorMsg: fullMsg };
  }
  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return { errorCode: "ENOTFOUND", errorMsg: fullMsg };
  }
  if (causeCode === "ECONNREFUSED") {
    return { errorCode: "ECONNREFUSED", errorMsg: fullMsg };
  }
  if (causeCode === "ETIMEDOUT" || causeCode === "ESOCKETTIMEDOUT") {
    return { errorCode: "ETIMEDOUT", errorMsg: fullMsg };
  }

  const upper = fullMsg.toUpperCase();
  if (upper.includes("ENOTFOUND") || upper.includes("DNS")) {
    return { errorCode: "ENOTFOUND", errorMsg: fullMsg };
  }
  if (upper.includes("ECONNREFUSED")) {
    return { errorCode: "ECONNREFUSED", errorMsg: fullMsg };
  }
  if (upper.includes("ETIMEDOUT") || upper.includes("CONNECT TIMED OUT")) {
    return { errorCode: "ETIMEDOUT", errorMsg: fullMsg };
  }
  if (
    upper.includes("SSL") ||
    upper.includes("TLS") ||
    upper.includes("CERTIFICATE") ||
    upper.includes("CERT_") ||
    upper.includes("ERR_CERT")
  ) {
    return { errorCode: "SSL_ERROR", errorMsg: fullMsg };
  }
  if (upper.includes("REDIRECT") || upper.includes("TOO MANY REDIRECT")) {
    return { errorCode: "REDIRECT_LOOP", errorMsg: fullMsg };
  }
  return { errorCode: "UNKNOWN", errorMsg: fullMsg };
};

export const classifyFailureOwner = (
  errorCode: string | null,
  httpStatus: number | null,
): "site" | "collector" | "policy" | null => {
  if (errorCode === null && httpStatus !== null) return null;
  if (errorCode === null) return null;
  if (errorCode === "HTTP_5XX") return "site";
  if (errorCode === "ENOTFOUND") return "site";
  if (errorCode === "ECONNREFUSED") return "site";
  if (errorCode === "TIMEOUT" || errorCode === "ETIMEDOUT") return "collector";
  if (errorCode === "SSL_ERROR") return "site";
  if (errorCode === "REDIRECT_LOOP") return "collector";
  if (errorCode === "BLOCKED") return "policy";
  return "collector";
};
