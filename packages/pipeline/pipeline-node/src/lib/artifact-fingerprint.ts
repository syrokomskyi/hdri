/*
<MODULE_CONTRACT>
  <purpose>Compute canonical SHA-256 digests for pipeline files, directories, and structured values.</purpose>
  <non-goals>
    <item>Does not decide whether a pipeline step may be reused or execute a step.</item>
    <item>Does not read secrets, resolve environment variables, or write manifests.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0094: Add deterministic artifact fingerprint primitives for the shared lifecycle.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactDigest = {
  sha256: string;
  bytes: number;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const canonicalValue = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Fingerprint values must contain finite numbers");
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const secretKey = Object.keys(record).find((key) =>
      /^(api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token|credential)$/i.test(key),
    );
    if (secretKey)
      throw new Error(`Fingerprint values must not contain secret-bearing key: ${secretKey}`);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported fingerprint value type: ${typeof value}`);
};

export const digestValue = (value: unknown): ArtifactDigest => {
  const canonical = canonicalValue(value);
  return { sha256: sha256(canonical), bytes: Buffer.byteLength(canonical, "utf8") };
};

export const digestFile = async (filePath: string): Promise<ArtifactDigest> => {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile()) throw new Error(`Fingerprint input is not a file: ${filePath}`);
  // Stream the digest: buffering whole files lets a single large stage output
  // push the coordinator past its RSS ceiling (RFC-0115 2 GiB coordinator limit).
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return { sha256: hash.digest("hex"), bytes: stat.size };
};

export const digestDirectory = async (directoryPath: string): Promise<ArtifactDigest> => {
  const entries: string[] = [];
  const walk = async (currentPath: string): Promise<void> => {
    const children = await fs.readdir(currentPath, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(currentPath, child.name);
      const relativePath = path.relative(directoryPath, absolutePath).split(path.sep).join("/");
      if (child.isSymbolicLink())
        throw new Error(`Fingerprint input contains a symlink: ${relativePath}`);
      if (child.isDirectory()) {
        entries.push(`dir:${relativePath}`);
        await walk(absolutePath);
      } else if (child.isFile()) {
        const digest = await digestFile(absolutePath);
        entries.push(`file:${relativePath}:${digest.bytes}:${digest.sha256}`);
      } else {
        throw new Error(`Unsupported fingerprint directory entry: ${relativePath}`);
      }
    }
  };
  await walk(directoryPath);
  return digestValue(entries);
};
