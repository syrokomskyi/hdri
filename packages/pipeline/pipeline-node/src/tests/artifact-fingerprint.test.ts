import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { digestDirectory, digestValue } from "../index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })));
});

describe("artifact fingerprints", () => {
  it("canonically orders object keys", () => {
    expect(digestValue({ beta: [true, null], alpha: "value" })).toEqual(
      digestValue({ alpha: "value", beta: [true, null] }),
    );
  });

  it("is stable regardless of directory creation order", async () => {
    const left = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-fingerprint-left-"));
    const right = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-fingerprint-right-"));
    temporaryDirectories.push(left, right);
    await fs.mkdir(path.join(left, "nested"));
    await fs.writeFile(path.join(left, "a.txt"), "a");
    await fs.writeFile(path.join(left, "nested", "b.txt"), "b");
    await fs.mkdir(path.join(right, "nested"));
    await fs.writeFile(path.join(right, "nested", "b.txt"), "b");
    await fs.writeFile(path.join(right, "a.txt"), "a");

    await expect(digestDirectory(left)).resolves.toEqual(await digestDirectory(right));
  });
});
