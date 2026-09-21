/*
<MODULE_CONTRACT>
<purpose>Sanitizes and serializes JSON-compatible values, omitting undefined or non-finite values.</purpose>
<non-goals>
  <item>Does not handle circular references in objects.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of JSON sanitization and serialization functions.</item>
</CHANGE_SUMMARY>
*/

type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const shouldOmitScalar = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }

  if (typeof value === "number") {
    return !Number.isFinite(value);
  }

  return false;
};

export const sanitizeJsonValue = (value: unknown): JsonValue | undefined => {
  if (value === undefined || shouldOmitScalar(value)) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const next = value.flatMap((item) => {
      const sanitized = sanitizeJsonValue(item);
      return sanitized === undefined ? [] : [sanitized];
    });

    return next;
  }

  if (isPlainObject(value)) {
    const nextEntries = Object.entries(value).flatMap(([key, item]) => {
      const sanitized = sanitizeJsonValue(item);
      return sanitized === undefined ? [] : [[key, sanitized] as const];
    });

    return Object.fromEntries(nextEntries);
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
};

export const stringifyJsonOutput = (value: unknown): string => {
  const sanitized = sanitizeJsonValue(value);
  return JSON.stringify(sanitized ?? {}, null, 2);
};
