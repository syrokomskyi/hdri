import { describe, it, expect } from "vitest";
import { classifyError } from "../liveness.js";

const makeError = (msg: string, cause?: { code?: string; message?: string }): Error => {
  const err = new Error(msg);
  if (cause) {
    err.cause = cause.code
      ? Object.assign(new Error(cause.message ?? ""), { code: cause.code })
      : new Error(cause.message ?? "");
  }
  return err;
};

describe("classifyError", () => {
  it("returns TIMEOUT when timedOut is true", () => {
    const result = classifyError(new Error("some error"), true);
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("returns ENOTFOUND for cause.code ENOTFOUND", () => {
    const err = makeError("getaddrinfo failed", {
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND example.com",
    });
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("ENOTFOUND");
  });

  it("returns ECONNREFUSED for cause.code ECONNREFUSED", () => {
    const err = makeError("connect failed", {
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:443",
    });
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("ECONNREFUSED");
  });

  it("returns ETIMEDOUT for cause.code ETIMEDOUT", () => {
    const err = makeError("connect timeout", { code: "ETIMEDOUT", message: "connect ETIMEDOUT" });
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("ETIMEDOUT");
  });

  it("returns SSL_ERROR for message containing SSL", () => {
    const err = makeError("SSL certificate verification failed");
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("SSL_ERROR");
  });

  it("returns REDIRECT_LOOP for message containing REDIRECT", () => {
    const err = makeError("Too many redirect");
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("REDIRECT_LOOP");
  });

  it("returns UNKNOWN for generic errors", () => {
    const err = makeError("something went wrong");
    const result = classifyError(err, false);
    expect(result.errorCode).toBe("UNKNOWN");
  });
});
