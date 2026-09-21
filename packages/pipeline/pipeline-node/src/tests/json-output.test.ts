import { describe, it, expect } from "vitest";
import { sanitizeJsonValue, stringifyJsonOutput } from "../lib/json-output.js";

describe("sanitizeJsonValue", () => {
  it("returns null for null", () => {
    expect(sanitizeJsonValue(null)).toBeNull();
  });

  it("returns false for false", () => {
    expect(sanitizeJsonValue(false)).toBe(false);
  });

  it("returns 0 for 0", () => {
    expect(sanitizeJsonValue(0)).toBe(0);
  });

  it("returns empty string for empty string", () => {
    expect(sanitizeJsonValue("")).toBe("");
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

  it("preserves falsy entries from arrays", () => {
    expect(sanitizeJsonValue([1, 0, "a", "", null, false, 2])).toEqual([
      1,
      0,
      "a",
      "",
      null,
      false,
      2,
    ]);
  });

  it("returns empty array for empty array", () => {
    expect(sanitizeJsonValue([])).toEqual([]);
  });

  it("preserves array of all falsy values", () => {
    expect(sanitizeJsonValue([0, "", null, false])).toEqual([0, "", null, false]);
  });

  it("preserves falsy entries in objects", () => {
    expect(sanitizeJsonValue({ a: 1, b: 0, c: "x", d: "", e: null, f: 2 })).toEqual({
      a: 1,
      b: 0,
      c: "x",
      d: "",
      e: null,
      f: 2,
    });
  });

  it("returns empty object for empty object", () => {
    expect(sanitizeJsonValue({})).toEqual({});
  });

  it("preserves object with all falsy values", () => {
    expect(sanitizeJsonValue({ a: 0, b: "", c: null })).toEqual({ a: 0, b: "", c: null });
  });

  it("handles nested objects", () => {
    expect(sanitizeJsonValue({ outer: { inner: "val", empty: "" } })).toEqual({
      outer: { inner: "val", empty: "" },
    });
  });

  it("handles nested arrays", () => {
    expect(sanitizeJsonValue({ items: [1, 0, "a"] })).toEqual({ items: [1, 0, "a"] });
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

  it("preserves falsy values in objects", () => {
    const result = stringifyJsonOutput({ a: 0, b: "" });
    expect(JSON.parse(result)).toEqual({ a: 0, b: "" });
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
