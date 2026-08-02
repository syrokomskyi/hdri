import { describe, it, expect } from "vitest";
import { hashFile } from "../hash-file.js";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

describe("hashFile", () => {
  it("computes correct SHA-256 for a simple file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-test-"));
    const filePath = join(dir, "test.txt");
    const content = "hello world";
    writeFileSync(filePath, content);
    const expected = createHash("sha256").update(content).digest("hex");
    const result = await hashFile(filePath);
    expect(result).toBe(expected);
    unlinkSync(filePath);
  });

  it("computes correct SHA-256 for empty file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-test-"));
    const filePath = join(dir, "empty.txt");
    writeFileSync(filePath, "");
    const expected = createHash("sha256").update("").digest("hex");
    const result = await hashFile(filePath);
    expect(result).toBe(expected);
    unlinkSync(filePath);
  });

  it("computes correct SHA-256 for binary content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-test-"));
    const filePath = join(dir, "binary.bin");
    const content = Buffer.from([0x00, 0xff, 0x42, 0x01, 0x80]);
    writeFileSync(filePath, content);
    const expected = createHash("sha256").update(content).digest("hex");
    const result = await hashFile(filePath);
    expect(result).toBe(expected);
    unlinkSync(filePath);
  });

  it("returns a 64-character hex string", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-test-"));
    const filePath = join(dir, "test.txt");
    writeFileSync(filePath, "test");
    const result = await hashFile(filePath);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    unlinkSync(filePath);
  });

  it("rejects when file does not exist", async () => {
    await expect(hashFile("/nonexistent/path/file.txt")).rejects.toThrow();
  });
});
