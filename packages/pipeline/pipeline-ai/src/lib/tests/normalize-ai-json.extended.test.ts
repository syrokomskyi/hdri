import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  normalizeAiJsonText,
  parseAiJson,
  parseAiJsonWithSchema,
  safeParseAiJsonWithSchema,
} from "../normalize-ai-json.js";

describe("normalizeAiJsonText", () => {
  it("strips ```json fences", () => {
    expect(normalizeAiJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips plain ``` fences", () => {
    expect(normalizeAiJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts JSON from surrounding text", () => {
    expect(normalizeAiJsonText('Here is the result: {"a":1} done.')).toBe('{"a":1}');
  });

  it("extracts array JSON from surrounding text", () => {
    expect(normalizeAiJsonText("Result: [1, 2, 3] end")).toBe("[1, 2, 3]");
  });

  it("handles plain JSON without fences", () => {
    expect(normalizeAiJsonText('{"a":1}')).toBe('{"a":1}');
  });

  it("handles plain array without fences", () => {
    expect(normalizeAiJsonText("[1, 2, 3]")).toBe("[1, 2, 3]");
  });

  it("trims whitespace", () => {
    expect(normalizeAiJsonText('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("returns text as-is when no JSON found", () => {
    expect(normalizeAiJsonText("no json here")).toBe("no json here");
  });

  it("handles empty string", () => {
    expect(normalizeAiJsonText("")).toBe("");
  });

  it("extracts from first opening to last closing brace", () => {
    expect(normalizeAiJsonText('{"first":1} ... {"second":2}')).toBe(
      '{"first":1} ... {"second":2}',
    );
  });

  it("handles case-insensitive ```json fence", () => {
    expect(normalizeAiJsonText('```JSON\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("parseAiJson", () => {
  it("parses fenced JSON object", () => {
    expect(parseAiJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses fenced JSON array", () => {
    expect(parseAiJson("```json\n[1, 2, 3]\n```")).toEqual([1, 2, 3]);
  });

  it("parses JSON with surrounding text", () => {
    expect(parseAiJson('Here: {"x": 42}')).toEqual({ x: 42 });
  });

  it("throws for invalid JSON", () => {
    expect(() => parseAiJson("not json at all")).toThrow();
  });
});

const testSchema = z.object({
  name: z.string(),
  score: z.number().int(),
});

describe("parseAiJsonWithSchema", () => {
  it("parses valid fenced JSON through schema", () => {
    const result = parseAiJsonWithSchema('```json\n{"name":"Acme","score":7}\n```', testSchema);
    expect(result).toEqual({ name: "Acme", score: 7 });
  });

  it("throws on schema mismatch", () => {
    expect(() => parseAiJsonWithSchema('{"name":"Acme","score":"bad"}', testSchema)).toThrow();
  });
});

describe("safeParseAiJsonWithSchema", () => {
  it("returns ok result for valid input", () => {
    const result = safeParseAiJsonWithSchema('{"name":"A","score":1}', testSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: "A", score: 1 });
      expect(result.normalized).toBe('{"name":"A","score":1}');
    }
  });

  it("returns error result for schema mismatch", () => {
    const result = safeParseAiJsonWithSchema('{"name":"A","score":"bad"}', testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.normalized).toBe('{"name":"A","score":"bad"}');
    }
  });

  it("returns error result for invalid JSON", () => {
    const result = safeParseAiJsonWithSchema("not json", testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
