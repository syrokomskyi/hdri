import { describe, it, expect } from "vitest";
import { validateType } from "../lib/utils.js";

describe("validateType", () => {
  it("returns true when type matches", () => {
    expect(validateType("hello", "string")).toBe(true);
    expect(validateType(42, "number")).toBe(true);
    expect(validateType(true, "boolean")).toBe(true);
    expect(validateType({}, "object")).toBe(true);
    expect(validateType([], "object")).toBe(true);
    expect(validateType(null, "object")).toBe(true);
    expect(validateType(undefined, "undefined")).toBe(true);
    expect(validateType(() => {}, "function")).toBe(true);
    expect(validateType(Symbol("s"), "symbol")).toBe(true);
    expect(validateType(0n, "bigint")).toBe(true);
  });

  it("returns false when type does not match", () => {
    expect(validateType(42, "string")).toBe(false);
    expect(validateType("hello", "number")).toBe(false);
    expect(validateType(null, "undefined")).toBe(false);
    expect(validateType(undefined, "object")).toBe(false);
    expect(validateType(true, "number")).toBe(false);
    expect(validateType({}, "function")).toBe(false);
  });
});
