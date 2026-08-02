import { describe, it, expect } from "vitest";
import { writeLlmArtifactsIfMissing } from "../lib/llm-artifacts.js";

describe("writeLlmArtifactsIfMissing", () => {
  it("returns false when skipIfExistsPath already exists", async () => {
    const result = await writeLlmArtifactsIfMissing({
      artifacts: [],
      ensureOutputDir: async () => {},
      fileExists: async (p) => p === "/output/done.txt",
      outputDir: "/output",
      skipIfExistsPath: "/output/done.txt",
      writeLlmArtifact: async () => "",
    });
    expect(result).toBe(false);
  });

  it("generates and writes artifacts when skipIfExistsPath is missing", async () => {
    const written: Array<{ path: string; content: string }> = [];
    const result = await writeLlmArtifactsIfMissing({
      artifacts: [
        { outputPath: "/output/a.txt", generate: async () => "content-a" },
        { outputPath: "/output/b.txt", generate: async () => "content-b" },
      ],
      ensureOutputDir: async () => {},
      fileExists: async () => false,
      outputDir: "/output",
      skipIfExistsPath: "/output/done.txt",
      writeLlmArtifact: async (path, content) => {
        written.push({ path, content });
        return content;
      },
    });
    expect(result).toEqual(["content-a", "content-b"]);
    expect(written).toEqual([
      { path: "/output/a.txt", content: "content-a" },
      { path: "/output/b.txt", content: "content-b" },
    ]);
  });

  it("uses branded writer for branded artifacts", async () => {
    const written: Array<{ path: string; content: string; branded: boolean }> = [];
    const result = await writeLlmArtifactsIfMissing({
      artifacts: [
        { outputPath: "/output/a.txt", generate: async () => "plain" },
        { outputPath: "/output/b.txt", branded: true, generate: async () => "branded" },
      ],
      ensureOutputDir: async () => {},
      fileExists: async () => false,
      outputDir: "/output",
      skipIfExistsPath: "/output/done.txt",
      writeLlmArtifact: async (path, content) => {
        written.push({ path, content, branded: false });
        return content;
      },
      writeBrandedLlmArtifact: async (path, content) => {
        written.push({ path, content, branded: true });
        return content;
      },
    });
    expect(result).toEqual(["plain", "branded"]);
    expect(written).toEqual([
      { path: "/output/a.txt", content: "plain", branded: false },
      { path: "/output/b.txt", content: "branded", branded: true },
    ]);
  });

  it("throws when branded writer is missing for branded artifact", async () => {
    await expect(
      writeLlmArtifactsIfMissing({
        artifacts: [{ outputPath: "/output/a.txt", branded: true, generate: async () => "x" }],
        ensureOutputDir: async () => {},
        fileExists: async () => false,
        outputDir: "/output",
        skipIfExistsPath: "/output/done.txt",
        writeLlmArtifact: async () => "",
      }),
    ).rejects.toThrow("Missing branded LLM writer");
  });

  it("calls ensureOutputDir before writing", async () => {
    let dirEnsured = false;
    await writeLlmArtifactsIfMissing({
      artifacts: [{ outputPath: "/output/a.txt", generate: async () => "x" }],
      ensureOutputDir: async (dir) => {
        expect(dir).toBe("/output");
        dirEnsured = true;
      },
      fileExists: async () => false,
      outputDir: "/output",
      skipIfExistsPath: "/output/done.txt",
      writeLlmArtifact: async () => "",
    });
    expect(dirEnsured).toBe(true);
  });
});
