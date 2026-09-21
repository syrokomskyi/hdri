import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  assertFreshDirectory,
  copyVerifiedFile,
  inspectRetainedFile,
  readBoundedFile,
  writeExclusiveFile,
} from "../lib/retained-files.js";
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "retained-files-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
it("copies exact authenticated bytes and refuses an existing destination", async () => {
  const source = path.join(root, "source"),
    dest = path.join(root, "destination");
  await fs.writeFile(source, "abc");
  const proof = {
    bytes: 3,
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  };
  expect(await inspectRetainedFile(source)).toEqual(proof);
  await copyVerifiedFile(source, dest, proof);
  await expect(copyVerifiedFile(source, dest, proof)).rejects.toThrow();
  expect(await fs.readFile(dest, "utf8")).toBe("abc");
});
it("rejects an unexpected digest and never presents the partial file as verified", async () => {
  const source = path.join(root, "source");
  await fs.writeFile(source, "abc");
  await expect(
    copyVerifiedFile(source, path.join(root, "copy"), { bytes: 3, sha256: "0".repeat(64) }),
  ).rejects.toThrow("CHANGED_SOURCE_BYTES");
});
it("rejects final and ancestor symlinks", async () => {
  await fs.writeFile(path.join(root, "source"), "abc");
  await fs.symlink(path.join(root, "source"), path.join(root, "alias"));
  await expect(inspectRetainedFile(path.join(root, "alias"))).rejects.toThrow("UNSAFE_OBJECT_PATH");
  await fs.symlink(root, path.join(root, "directory-alias"));
  await expect(
    writeExclusiveFile(path.join(root, "directory-alias/new"), Buffer.from("x")),
  ).rejects.toThrow("UNSAFE_OBJECT_PATH");
});
it("bounds JSON reads and requires a genuinely fresh root", async () => {
  const source = path.join(root, "source");
  await fs.writeFile(source, "abcdef");
  await expect(readBoundedFile(source, 3)).rejects.toThrow();
  await expect(assertFreshDirectory(root)).rejects.toThrow("FRESH_ROOT_REQUIRED");
  await expect(assertFreshDirectory(path.join(root, "new"))).resolves.toBeUndefined();
});
it("creates nested retained directories and permits only one concurrent exclusive writer", async () => {
  const file = path.join(root, "new/nested/object");
  const results = await Promise.allSettled([
    writeExclusiveFile(file, Buffer.from("first")),
    writeExclusiveFile(file, Buffer.from("second")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(["first", "second"]).toContain(await fs.readFile(file, "utf8"));
});
it("detects source mutation while consuming its held file descriptor", async () => {
  const file = path.join(root, "changing");
  await fs.writeFile(file, "a".repeat(128 * 1024));
  let mutated = false;
  // The callback is deliberately asynchronous to inject a real filesystem race.
  await expect(
    inspectRetainedFile(file, async () => {
      if (mutated) return;
      mutated = true;
      await fs.appendFile(file, "b");
    }),
  ).rejects.toThrow("CHANGED_SOURCE_BYTES");
});
it("detaches caller-owned bytes and expected identity before asynchronous I/O", async () => {
  const bytes = Buffer.from("abc");
  const source = path.join(root, "source");
  const writing = writeExclusiveFile(source, bytes);
  bytes.fill(0);
  await writing;
  expect(await fs.readFile(source, "utf8")).toBe("abc");
  const expected = { bytes: 3, sha256: "0".repeat(64) };
  const copying = copyVerifiedFile(source, path.join(root, "copy"), expected);
  expected.sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  await expect(copying).rejects.toThrow("CHANGED_SOURCE_BYTES");
});
