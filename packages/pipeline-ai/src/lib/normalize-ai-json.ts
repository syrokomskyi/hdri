export const normalizeAiJsonText = (raw: string): string => {
  const fencedNormalized = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const objectStart = fencedNormalized.indexOf('{');
  const arrayStart = fencedNormalized.indexOf('[');
  const hasObject = objectStart >= 0;
  const hasArray = arrayStart >= 0;

  const jsonStart = !hasObject
    ? arrayStart
    : !hasArray
      ? objectStart
      : Math.min(objectStart, arrayStart);

  const openingChar =
    jsonStart >= 0 ? fencedNormalized[jsonStart] : null;
  const closingChar = openingChar === '[' ? ']' : openingChar === '{' ? '}' : null;
  const jsonEnd =
    closingChar === null ? -1 : fencedNormalized.lastIndexOf(closingChar);

  return jsonStart >= 0 && jsonEnd > jsonStart
    ? fencedNormalized.slice(jsonStart, jsonEnd + 1)
    : fencedNormalized;
};

export const parseAiJson = <T>(raw: string): T => {
  const normalized = normalizeAiJsonText(raw);
  return JSON.parse(normalized) as T;
};
