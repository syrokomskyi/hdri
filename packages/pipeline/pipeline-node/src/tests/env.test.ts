import { describe, it, expect } from "vitest";
import { getRequiredEnv } from "../lib/env.js";

describe("getRequiredEnv", () => {
  it("returns value when env var is set", () => {
    expect(getRequiredEnv("MY_VAR", { MY_VAR: "hello" })).toBe("hello");
  });

  it("throws when env var is missing", () => {
    expect(() => getRequiredEnv("MISSING", {})).toThrow(
      "Missing required environment variable: MISSING",
    );
  });

  it("throws when env var is empty string", () => {
    expect(() => getRequiredEnv("EMPTY", { EMPTY: "" })).toThrow(
      "Missing required environment variable: EMPTY",
    );
  });

  it("uses process.env by default", () => {
    process.env.TEST_ENV_VAR = "test-value";
    expect(getRequiredEnv("TEST_ENV_VAR")).toBe("test-value");
    delete process.env.TEST_ENV_VAR;
  });
});
