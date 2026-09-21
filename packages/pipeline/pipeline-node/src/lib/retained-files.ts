/*
<MODULE_CONTRACT>
  <purpose>Retain exact artifact bytes through bounded handles without overwriting existing evidence.</purpose>
  <non-goals><item>Does not authenticate signatures, freeze hostile ancestor directories or grant domain admission.</item></non-goals>
  <!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add canonical nonsymlink paths, exclusive durable file copies and bounded verified reads.</item><item>Persist nested directory entries and detach caller-owned bytes and identity before yielding.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Existing artifacts are never overwritten; callers must keep ancestor directories stable during I/O.
import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface RetainedFileDigest {
  sha256: string;
  bytes: number;
}

export function assertRelativeObjectPath(value: string): void {
  if (
    typeof value !== "string" ||
    value.includes(":") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("UNSAFE_OBJECT_PATH");
  }
}

/** Missing descendants are allowed only for preflight; existing ancestors must be real directories. */
export async function assertCanonicalFilePath(value: string, allowMissing = false): Promise<void> {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    path.normalize(value) !== value ||
    value.includes("\0")
  )
    throw new Error("EXPLICIT_CANONICAL_PATH_REQUIRED");
  const root = path.parse(value).root;
  let current = root;
  const parts = value.slice(root.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()))
      throw new Error("UNSAFE_OBJECT_PATH");
  }
}

export function assertDisjointPaths(paths: readonly string[]): void {
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) {
      const relative = path.relative(paths[i], paths[j]);
      const reverse = path.relative(paths[j], paths[i]);
      const contains = (r: string) =>
        !r || (!path.isAbsolute(r) && r !== ".." && !r.startsWith(`..${path.sep}`));
      if (contains(relative) || contains(reverse)) throw new Error("OVERLAPPING_ROOTS");
    }
}

export async function assertFreshDirectory(value: string): Promise<void> {
  await assertCanonicalFilePath(value, true);
  // Require an existing parent: a caller cannot accidentally create an arbitrary deep root.
  await assertCanonicalFilePath(path.dirname(value));
  try {
    await fs.lstat(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("FRESH_ROOT_REQUIRED");
}

export async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Persist every newly created directory entry, not just the final file's parent. */
async function ensureDirectory(directory: string): Promise<void> {
  await assertCanonicalFilePath(directory, true);
  try {
    if (!(await fs.lstat(directory)).isDirectory()) throw new Error("DIRECTORY_REQUIRED");
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await ensureDirectory(path.dirname(directory));
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await assertCanonicalFilePath(directory);
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error("DIRECTORY_REQUIRED");
  await syncDirectory(directory);
  await syncDirectory(path.dirname(directory));
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}

async function consumeFile(
  file: string,
  consume: (chunk: Buffer) => Promise<void> | void,
  maxBytes: number,
): Promise<RetainedFileDigest> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("INVALID_FILE_BYTE_LIMIT");
  await assertCanonicalFilePath(file);
  const handle = await fs.open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maxBytes))
      throw new Error("INVALID_OR_OVERSIZED_FILE");
    const hash = createHash("sha256");
    let bytes = 0;
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
      if (bytes > maxBytes) throw new Error("FILE_BYTE_LIMIT_EXCEEDED");
      const chunk = buffer.subarray(0, read.bytesRead);
      hash.update(chunk);
      await consume(chunk);
    }
    await assertCanonicalFilePath(file);
    const after = await handle.stat({ bigint: true });
    const named = await fs.lstat(file, { bigint: true });
    if (!sameFile(before, after) || !sameFile(after, named) || BigInt(bytes) !== before.size)
      throw new Error("CHANGED_SOURCE_BYTES");
    return { sha256: hash.digest("hex"), bytes };
  } finally {
    await handle.close();
  }
}

export const inspectRetainedFile = (
  file: string,
  onChunk: (chunk: Buffer) => void | Promise<void> = () => {},
): Promise<RetainedFileDigest> => consumeFile(file, onChunk, Number.MAX_SAFE_INTEGER);

export async function readBoundedFile(file: string, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await consumeFile(
    file,
    (chunk) => {
      chunks.push(Buffer.from(chunk));
    },
    maxBytes,
  );
  return Buffer.concat(chunks);
}

export async function writeExclusiveFile(file: string, bytes: Uint8Array): Promise<void> {
  const retainedBytes = Buffer.from(bytes);
  await assertCanonicalFilePath(file, true);
  await ensureDirectory(path.dirname(file));
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await handle.writeFile(retainedBytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(file));
}

export async function copyVerifiedFile(
  source: string,
  destination: string,
  expected: RetainedFileDigest,
): Promise<void> {
  expected = { ...expected };
  if (
    !/^[0-9a-f]{64}$/.test(expected.sha256) ||
    !Number.isSafeInteger(expected.bytes) ||
    expected.bytes < 0
  )
    throw new Error("INVALID_EXPECTED_FILE_DIGEST");
  await assertCanonicalFilePath(source);
  await assertCanonicalFilePath(destination, true);
  await ensureDirectory(path.dirname(destination));
  const output = await fs.open(destination, "wx", 0o600);
  try {
    const actual = await consumeFile(source, (chunk) => output.writeFile(chunk), expected.bytes);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
      throw new Error("CHANGED_SOURCE_BYTES");
    await output.sync();
  } finally {
    await output.close();
  }
  await syncDirectory(path.dirname(destination));
  const copied = await inspectRetainedFile(destination);
  if (copied.sha256 !== expected.sha256 || copied.bytes !== expected.bytes)
    throw new Error("RETAINED_COPY_MISMATCH");
}
