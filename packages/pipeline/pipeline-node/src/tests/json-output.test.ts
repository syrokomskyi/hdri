import { describe, it, expect } from "vitest";
import { sanitizeJsonValue, stringifyJsonOutput } from "../lib/json-output.js";

describe("sanitizeJsonValue", () => {
  it("returns undefined for null", () => {
    expect(sanitizeJsonValue(null)).toBeUndefined();
  });

  it("returns undefined for false", () => {
    expect(sanitizeJsonValue(false)).toBeUndefined();
  });

  it("returns undefined for 0", () => {
    expect(sanitizeJsonValue(0)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(sanitizeJsonValue("")).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(sanitizeJsonValue(undefined)).toBeUndefined();
  });

  it("returns undefined for NaN", () => {
    expect(sanitizeJsonValue(NaN)).toBeUndefined();
  });

  it("returns undefined for Infinity", () => {
    expect(sanitizeJsonValue(Infinity)).toBeUndefined();
  });

  it("returns the value for a positive number", () => {
    expect(sanitizeJsonValue(42)).toBe(42);
  });

  it("returns the value for true", () => {
    expect(sanitizeJsonValue(true)).toBe(true);
  });

  it("returns the value for a non-empty string", () => {
    expect(sanitizeJsonValue("hello")).toBe("hello");
  });

  it("filters out falsy entries from arrays", () => {
    expect(sanitizeJsonValue([1, 0, "a", "", null, false, 2])).toEqual([1, "a", 2]);
  });

  it("returns undefined for empty array", () => {
    expect(sanitizeJsonValue([])).toBeUndefined();
  });

  it("returns undefined for array of all falsy values", () => {
    expect(sanitizeJsonValue([0, "", null, false])).toBeUndefined();
  });

  it("filters out falsy entries from objects", () => {
    expect(sanitizeJsonValue({ a: 1, b: 0, c: "x", d: "", e: null, f: 2 })).toEqual({
      a: 1,
      c: "x",
      f: 2,
    });
  });

  it("returns undefined for empty object", () => {
    expect(sanitizeJsonValue({})).toBeUndefined();
  });

  it("returns undefined for object with all falsy values", () => {
    expect(sanitizeJsonValue({ a: 0, b: "", c: null })).toBeUndefined();
  });

  it("handles nested objects", () => {
    expect(sanitizeJsonValue({ outer: { inner: "val", empty: "" } })).toEqual({
      outer: { inner: "val" },
    });
  });

  it("handles nested arrays", () => {
    expect(sanitizeJsonValue({ items: [1, 0, "a"] })).toEqual({ items: [1, "a"] });
  });

  it("returns undefined for unsupported types (bigint, function)", () => {
    expect(sanitizeJsonValue(42n)).toBeUndefined();
    expect(sanitizeJsonValue(() => {})).toBeUndefined();
  });
});

describe("stringifyJsonOutput", () => {
  it("produces pretty-printed JSON", () => {
    const result = stringifyJsonOutput({ a: 1, b: "hello" });
    expect(result).toContain('"a": 1');
    expect(result).toContain('"b": "hello"');
    expect(result).toContain("\n  ");
  });

  it("returns '{}' for all-falsy input", () => {
    expect(stringifyJsonOutput({ a: 0, b: "" })).toBe("{}");
  });

  it("returns '{}' for undefined", () => {
    expect(stringifyJsonOutput(undefined)).toBe("{}");
  });

  it("returns '{}' for null", () => {
    expect(stringifyJsonOutput(null)).toBe("{}");
  });

  it("handles arrays at top level", () => {
    const result = stringifyJsonOutput([1, 2, 3]);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });
});
