type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const shouldOmitScalar = (value: unknown): boolean => {
  if (value === null || value === false) {
    return true;
  }

  if (typeof value === "number") {
    return value === 0 || !Number.isFinite(value);
  }

  if (typeof value === "string") {
    return value.length === 0;
  }

  return false;
};

export const sanitizeJsonValue = (value: unknown): JsonValue | undefined => {
  if (shouldOmitScalar(value) || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const next = value.flatMap((item) => {
      const sanitized = sanitizeJsonValue(item);
      return sanitized === undefined ? [] : [sanitized];
    });

    return next.length > 0 ? next : undefined;
  }

  if (isPlainObject(value)) {
    const nextEntries = Object.entries(value).flatMap(([key, item]) => {
      const sanitized = sanitizeJsonValue(item);
      return sanitized === undefined ? [] : [[key, sanitized] as const];
    });

    return nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
};

export const stringifyJsonOutput = (value: unknown): string => {
  const sanitized = sanitizeJsonValue(value);
  return JSON.stringify(sanitized ?? {}, null, 2);
};
