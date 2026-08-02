import { describe, it, expect } from "vitest";
import {
  expectFrontmatterString,
  readOptionalFrontmatterString,
  readFrontmatterStringArray,
  readOptionalFrontmatterStringArray,
  readFrontmatterMemberReference,
  readFrontmatterMemberReferenceArray,
  readFrontmatterFiniteNumber,
  mergeBriefFrontmatter,
} from "../lib/frontmatter.js";

describe("expectFrontmatterString", () => {
  it("returns trimmed non-empty string", () => {
    expect(expectFrontmatterString("  hello  ", "label")).toBe("hello");
  });

  it("throws for non-string", () => {
    expect(() => expectFrontmatterString(42, "label")).toThrow("label must be a string");
  });

  it("throws for empty string", () => {
    expect(() => expectFrontmatterString("   ", "label")).toThrow(
      "label must be a non-empty string",
    );
  });
});

describe("readOptionalFrontmatterString", () => {
  it("returns trimmed string for non-empty input", () => {
    expect(readOptionalFrontmatterString("  hello  ")).toBe("hello");
  });

  it("returns undefined for empty string", () => {
    expect(readOptionalFrontmatterString("   ")).toBeUndefined();
  });

  it("returns undefined for non-string", () => {
    expect(readOptionalFrontmatterString(42)).toBeUndefined();
    expect(readOptionalFrontmatterString(undefined)).toBeUndefined();
  });
});

describe("readFrontmatterStringArray", () => {
  it("returns empty array for undefined", () => {
    expect(readFrontmatterStringArray(undefined, "label")).toEqual([]);
  });

  it("returns trimmed strings for valid array", () => {
    expect(readFrontmatterStringArray(["  a  ", "b"], "label")).toEqual(["a", "b"]);
  });

  it("throws for non-array", () => {
    expect(() => readFrontmatterStringArray("not array", "label")).toThrow(
      "label must be an array of strings",
    );
  });

  it("throws for array with non-string entry", () => {
    expect(() => readFrontmatterStringArray(["a", 42], "label")).toThrow(
      "label[1] must be a string",
    );
  });
});

describe("readOptionalFrontmatterStringArray", () => {
  it("returns undefined for undefined input", () => {
    expect(readOptionalFrontmatterStringArray(undefined, "label")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(readOptionalFrontmatterStringArray([], "label")).toBeUndefined();
  });

  it("returns array for non-empty array", () => {
    expect(readOptionalFrontmatterStringArray(["a", "b"], "label")).toEqual(["a", "b"]);
  });
});

describe("readFrontmatterMemberReference", () => {
  it("accepts a string id", () => {
    expect(readFrontmatterMemberReference("  my-id  ", "label")).toEqual({ id: "my-id" });
  });

  it("accepts an object with id", () => {
    expect(readFrontmatterMemberReference({ id: "obj-id" }, "label")).toEqual({ id: "obj-id" });
  });

  it("throws for null", () => {
    expect(() => readFrontmatterMemberReference(null, "label")).toThrow(
      "label must be a string or object with id",
    );
  });

  it("throws for array", () => {
    expect(() => readFrontmatterMemberReference([], "label")).toThrow(
      "label must be a string or object with id",
    );
  });

  it("throws for object with empty id", () => {
    expect(() => readFrontmatterMemberReference({ id: "" }, "label")).toThrow(
      "label.id must be a non-empty string",
    );
  });
});

describe("readFrontmatterMemberReferenceArray", () => {
  it("returns references for valid array", () => {
    expect(readFrontmatterMemberReferenceArray(["a", { id: "b" }], "label")).toEqual([
      { id: "a" },
      { id: "b" },
    ]);
  });

  it("throws for non-array", () => {
    expect(() => readFrontmatterMemberReferenceArray("not array", "label")).toThrow(
      "label must be an array",
    );
  });
});

describe("readFrontmatterFiniteNumber", () => {
  it("returns finite number", () => {
    expect(readFrontmatterFiniteNumber(42, "label")).toBe(42);
    expect(readFrontmatterFiniteNumber(-3.14, "label")).toBe(-3.14);
  });

  it("throws for non-number", () => {
    expect(() => readFrontmatterFiniteNumber("42", "label")).toThrow(
      "label must be a finite number",
    );
  });

  it("throws for Infinity", () => {
    expect(() => readFrontmatterFiniteNumber(Infinity, "label")).toThrow(
      "label must be a finite number",
    );
  });

  it("throws for NaN", () => {
    expect(() => readFrontmatterFiniteNumber(NaN, "label")).toThrow(
      "label must be a finite number",
    );
  });
});

describe("mergeBriefFrontmatter", () => {
  it("merges with local taking precedence", () => {
    expect(mergeBriefFrontmatter({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({
      a: 1,
      b: 3,
      c: 4,
    });
  });

  it("handles empty root", () => {
    expect(mergeBriefFrontmatter({}, { a: 1 })).toEqual({ a: 1 });
  });

  it("handles empty local", () => {
    expect(mergeBriefFrontmatter({ a: 1 }, {})).toEqual({ a: 1 });
  });
});
