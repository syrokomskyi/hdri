import fs from "node:fs";

import matter from "gray-matter";

export type FrontmatterData = Record<string, unknown>;

export type FrontmatterFile = {
  content: string;
  data: FrontmatterData;
};

export type FrontmatterMemberReference = {
  id: string;
};

export const createCachedFrontmatterFileReader = (options: {
  trimContent?: boolean;
} = {}) => {
  const cache = new Map<string, FrontmatterFile>();

  return (absolutePath: string): FrontmatterFile => {
    const cached = cache.get(absolutePath);
    if (cached) {
      return cached;
    }

    const raw = fs.readFileSync(absolutePath, "utf8");
    const parsed = matter(raw);
    const file: FrontmatterFile = {
      content: options.trimContent === false ? parsed.content : parsed.content.trim(),
      data: (parsed.data ?? {}) as FrontmatterData,
    };
    cache.set(absolutePath, file);
    return file;
  };
};

export const expectFrontmatterString = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return trimmed;
};

export const readOptionalFrontmatterString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const readFrontmatterStringArray = (value: unknown, label: string): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`);
  }

  return value.map((entry, index) => expectFrontmatterString(entry, `${label}[${index}]`));
};

export const readOptionalFrontmatterStringArray = (
  value: unknown,
  label: string,
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const items = readFrontmatterStringArray(value, label);
  return items.length > 0 ? items : undefined;
};

export const readFrontmatterMemberReference = (
  value: unknown,
  label: string,
): FrontmatterMemberReference => {
  if (typeof value === "string") {
    return {
      id: expectFrontmatterString(value, `${label}.id`),
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a string or object with id`);
  }

  const record = value as Record<string, unknown>;
  return {
    id: expectFrontmatterString(record.id, `${label}.id`),
  };
};

export const readFrontmatterMemberReferenceArray = (
  value: unknown,
  label: string,
): FrontmatterMemberReference[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value.map((entry, index) =>
    readFrontmatterMemberReference(entry, `${label}[${index}]`),
  );
};

export const readFrontmatterFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
};

/**
 * Merge two frontmatter data objects.
 * App-local values take precedence over root values.
 * Returns a new frontmatter object suitable for re-stringifying.
 */
export const mergeBriefFrontmatter = (
  rootData: FrontmatterData,
  localData: FrontmatterData,
): FrontmatterData => {
  return { ...rootData, ...localData };
};
