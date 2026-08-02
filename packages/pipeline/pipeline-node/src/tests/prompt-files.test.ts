import { describe, it, expect } from "vitest";
import {
  appendOutputLanguageInstruction,
  assertPromptTextReady,
  createPromptFileReader,
} from "../lib/prompt-files.js";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";

describe("appendOutputLanguageInstruction", () => {
  it("appends language instructions to prompt text", () => {
    const result = appendOutputLanguageInstruction("Do something.", "Deutsch");
    expect(result).toContain("Do something.");
    expect(result).toContain("Deutsch");
    expect(result).toContain("CRITICAL");
  });

  it("trims trailing whitespace from prompt text", () => {
    const result = appendOutputLanguageInstruction("Do something.   \n\n", "English");
    expect(result).toContain("Do something.\n");
  });
});

describe("assertPromptTextReady", () => {
  it("does not throw for text without placeholders", () => {
    expect(() =>
      assertPromptTextReady({ fileName: "test.md", text: "This is a ready prompt." }),
    ).not.toThrow();
  });

  it("throws PipelinePauseError for TODO placeholder", () => {
    expect(() =>
      assertPromptTextReady({ fileName: "test.md", text: "This has TODO in it." }),
    ).toThrow(PipelinePauseError);
  });

  it("throws PipelinePauseError for TBD placeholder", () => {
    expect(() =>
      assertPromptTextReady({ fileName: "test.md", text: "This has TBD in it." }),
    ).toThrow(PipelinePauseError);
  });

  it("uses ownerId in error message when provided", () => {
    try {
      assertPromptTextReady({ fileName: "test.md", ownerId: "my-gogol", text: "TODO" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PipelinePauseError);
      expect((err as Error).message).toContain("my-gogol");
    }
  });

  it("uses fileName without extension as ownerId when not provided", () => {
    try {
      assertPromptTextReady({ fileName: "my-prompt.md", text: "TODO" });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("my-prompt");
    }
  });
});

describe("createPromptFileReader", () => {
  it("reads prompt file and returns text", async () => {
    const reader = createPromptFileReader({
      promptsDir: "/prompts",
      readTextFile: async () => "This is a prompt.",
    });
    const result = await reader.readPromptFile("test.md");
    expect(result).toBe("This is a prompt.");
  });

  it("appends output language when provided", async () => {
    const reader = createPromptFileReader({
      promptsDir: "/prompts",
      readTextFile: async () => "Do work.",
    });
    const result = await reader.readPromptFile("test.md", { outputLanguage: "Deutsch" });
    expect(result).toContain("Do work.");
    expect(result).toContain("Deutsch");
  });

  it("throws for prompt with TODO", async () => {
    const reader = createPromptFileReader({
      promptsDir: "/prompts",
      readTextFile: async () => "This has TODO.",
    });
    await expect(reader.readPromptFile("test.md")).rejects.toThrow(PipelinePauseError);
  });

  it("does not append for empty outputLanguage", async () => {
    const reader = createPromptFileReader({
      promptsDir: "/prompts",
      readTextFile: async () => "Do work.",
    });
    const result = await reader.readPromptFile("test.md", { outputLanguage: "  " });
    expect(result).toBe("Do work.");
  });
});
