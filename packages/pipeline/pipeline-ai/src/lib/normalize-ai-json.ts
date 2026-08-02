/*
<MODULE_CONTRACT>
<purpose>Parses and normalizes AI-generated JSON text, ensuring compatibility with Zod schemas.</purpose>
<non-goals>
  <item>Does not handle non-JSON text formats.</item>
  <item>Does not perform schema validation without a provided Zod schema.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of JSON parsing and normalization functions.</item>
</CHANGE_SUMMARY>
*/

import type { z } from "zod";

export const normalizeAiJsonText = (raw: string): string => {
  const fencedNormalized = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const objectStart = fencedNormalized.indexOf("{");
  const arrayStart = fencedNormalized.indexOf("[");
  const hasObject = objectStart >= 0;
  const hasArray = arrayStart >= 0;

  const jsonStart = !hasObject
    ? arrayStart
    : !hasArray
      ? objectStart
      : Math.min(objectStart, arrayStart);

  const openingChar = jsonStart >= 0 ? fencedNormalized[jsonStart] : null;
  const closingChar = openingChar === "[" ? "]" : openingChar === "{" ? "}" : null;
  const jsonEnd = closingChar === null ? -1 : fencedNormalized.lastIndexOf(closingChar);

  return jsonStart >= 0 && jsonEnd > jsonStart
    ? fencedNormalized.slice(jsonStart, jsonEnd + 1)
    : fencedNormalized;
};

export const parseAiJson = <T>(raw: string): T => {
  const normalized = normalizeAiJsonText(raw);
  return JSON.parse(normalized) as T;
};

export type AiJsonParseResult<T> =
  | {
      ok: true;
      value: T;
      normalized: string;
    }
  | {
      ok: false;
      error: Error;
      normalized: string;
    };

export const parseAiJsonWithSchema = <Schema extends z.ZodType>(
  raw: string,
  schema: Schema,
): z.infer<Schema> => {
  const normalized = normalizeAiJsonText(raw);
  return schema.parse(JSON.parse(normalized));
};

export const safeParseAiJsonWithSchema = <Schema extends z.ZodType>(
  raw: string,
  schema: Schema,
): AiJsonParseResult<z.infer<Schema>> => {
  const normalized = normalizeAiJsonText(raw);

  try {
    return {
      ok: true,
      value: schema.parse(JSON.parse(normalized)),
      normalized,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      normalized,
    };
  }
};
