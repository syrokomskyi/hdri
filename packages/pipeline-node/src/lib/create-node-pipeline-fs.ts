import fs from "node:fs/promises";
import path from "node:path";

import { stringifyJsonOutput } from "./json-output.js";

const textDecoder = new TextDecoder("utf-8");

export const ensureOutputDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readTextFile = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath);
  return textDecoder.decode(buffer);
};

export const readBinaryFile = async (filePath: string): Promise<Uint8Array> => {
  const buffer = await fs.readFile(filePath);
  return new Uint8Array(buffer);
};

export const listFiles = async (dirPath: string): Promise<string[]> => {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  return items
    .filter((item) => item.isFile())
    .map((item) => item.name)
    .filter((name) => !path.basename(name).startsWith("-"));
};

export const getImageMimeTypeByFileName = (fileName: string): string => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image extension: ${ext}`);
  }
};

export const readJsonFile = async (filePath: string): Promise<unknown> => {
  const text = await readTextFile(filePath);
  return JSON.parse(text);
};

export const writeTextFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${content}\n`, "utf-8");
};

export const writeBinaryFile = async (
  filePath: string,
  content: Uint8Array,
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
};

export const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await writeTextFile(filePath, stringifyJsonOutput(value));
};
