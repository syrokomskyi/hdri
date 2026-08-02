import { describe, expect, it } from "vitest";

import { countPopulatedValues, makeValueFields } from "../value.js";

describe("countPopulatedValues", () => {
  it("returns 0 when all fields are null", () => {
    expect(countPopulatedValues(makeValueFields(null, null, null, null))).toBe(0);
  });

  it("returns 1 when exactly one field is populated", () => {
    expect(countPopulatedValues(makeValueFields(true, null, null, null))).toBe(1);
    expect(countPopulatedValues(makeValueFields(null, 42, null, null))).toBe(1);
    expect(countPopulatedValues(makeValueFields(null, null, "hello", null))).toBe(1);
    expect(countPopulatedValues(makeValueFields(null, null, null, "{}"))).toBe(1);
  });

  it("returns 2 when two fields are populated", () => {
    expect(countPopulatedValues(makeValueFields(true, 42, null, null))).toBe(2);
  });

  it("returns 4 when all fields are populated", () => {
    expect(countPopulatedValues(makeValueFields(true, 42, "hello", "{}"))).toBe(4);
  });

  it("treats numeric zero as populated", () => {
    expect(countPopulatedValues(makeValueFields(null, 0, null, null))).toBe(1);
  });

  it("treats boolean false as populated", () => {
    expect(countPopulatedValues(makeValueFields(false, null, null, null))).toBe(1);
  });

  it("treats empty string as populated", () => {
    expect(countPopulatedValues(makeValueFields(null, null, "", null))).toBe(1);
  });
});

describe("makeValueFields", () => {
  it("creates fields with all nulls", () => {
    const fields = makeValueFields(null, null, null, null);
    expect(fields.value_bool).toBeNull();
    expect(fields.value_num).toBeNull();
    expect(fields.value_str).toBeNull();
    expect(fields.value_json).toBeNull();
  });

  it("creates fields with a bool value", () => {
    const fields = makeValueFields(true, null, null, null);
    expect(fields.value_bool).toBe(true);
    expect(fields.value_num).toBeNull();
  });
});
