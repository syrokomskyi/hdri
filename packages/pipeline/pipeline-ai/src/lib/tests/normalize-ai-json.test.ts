import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseAiJsonWithSchema, safeParseAiJsonWithSchema } from "../normalize-ai-json.js";

const profileSchema = z.object({
  name: z.string(),
  score: z.number().int(),
});

describe("AI JSON schema boundary", () => {
  it("parses fenced JSON through a Zod schema", () => {
    const parsed = parseAiJsonWithSchema('```json\n{"name":"Acme","score":7}\n```', profileSchema);

    expect(parsed).toEqual({ name: "Acme", score: 7 });
  });

  it("returns normalized text with validation errors", () => {
    const result = safeParseAiJsonWithSchema('{"name":"Acme","score":"bad"}', profileSchema);

    expect(result.ok).toBe(false);
    expect(result.normalized).toBe('{"name":"Acme","score":"bad"}');
  });
});
