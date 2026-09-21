import { describe, it, expect, vi } from "vitest";
import { getErrorMessage, logAiError, withLlmLogging } from "../logging.js";
import type { AiLogger } from "../types.js";

describe("getErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("test"))).toBe("test");
  });

  it("returns string directly", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("JSON-stringifies objects", () => {
    expect(getErrorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it("falls back to String() for circular refs", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = getErrorMessage(obj);
    expect(typeof result).toBe("string");
  });
});

describe("logAiError", () => {
  it("logs to console.error without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiError({
      provider: "openai",
      model: "gpt-4",
      operation: "generate",
      error: new Error("rate limited"),
    });
    expect(spy).toHaveBeenCalledOnce();
    const msg = spy.mock.calls[0]![0] as string;
    expect(msg).toContain("openai");
    expect(msg).toContain("gpt-4");
    expect(msg).toContain("rate limited");
    spy.mockRestore();
  });
});

describe("withLlmLogging", () => {
  function makeLogger(overrides: Partial<AiLogger> = {}): AiLogger {
    return {
      logCall: vi.fn(async () => "/tmp/call-1"),
      writeResponse: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("logs call, writes response, and returns result", async () => {
    const logger = makeLogger({
      logStepEvent: vi.fn(async () => {}),
      writeUsage: vi.fn(async () => {}),
    });
    const result = await withLlmLogging({
      operation: "generate",
      llm: { provider: "openai", model: "gpt-4", parameters: {} },
      logger,
      logOptions: {
        llm: { provider: "openai", model: "gpt-4", parameters: {} },
        userPrompts: ["hello"],
        responses: [],
      },
      run: async () => ({
        result: "generated text",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    });
    expect(result).toBe("generated text");
    expect(logger.logCall).toHaveBeenCalledOnce();
    expect(logger.writeResponse).toHaveBeenCalledOnce();
    expect(logger.writeUsage).toHaveBeenCalledOnce();
  });

  it("does not call writeUsage when no usage returned", async () => {
    const writeUsage = vi.fn(async () => {});
    const logger = makeLogger({ writeUsage });
    await withLlmLogging({
      operation: "generate",
      llm: { provider: "openai", model: "gpt-4", parameters: {} },
      logger,
      logOptions: {
        llm: { provider: "openai", model: "gpt-4", parameters: {} },
        userPrompts: ["hello"],
        responses: [],
      },
      run: async () => ({ result: "text" }),
    });
    expect(writeUsage).not.toHaveBeenCalled();
  });

  it("re-throws on run failure", async () => {
    const logger = makeLogger();
    await expect(
      withLlmLogging({
        operation: "generate",
        llm: { provider: "openai", model: "gpt-4", parameters: {} },
        logger,
        logOptions: {
          llm: { provider: "openai", model: "gpt-4", parameters: {} },
          userPrompts: ["hello"],
          responses: [],
        },
        run: async () => {
          throw new Error("API failed");
        },
      }),
    ).rejects.toThrow("API failed");
  });

  it("stringifies non-string results for writeResponse", async () => {
    const logger = makeLogger();
    await withLlmLogging({
      operation: "generate",
      llm: { provider: "openai", model: "gpt-4", parameters: {} },
      logger,
      logOptions: {
        llm: { provider: "openai", model: "gpt-4", parameters: {} },
        userPrompts: ["hello"],
        responses: [],
      },
      run: async () => ({ result: { data: 42 } }),
    });
    const call = vi.mocked(logger.writeResponse).mock.calls[0]!;
    expect(call[1]![0]!.content).toContain('"data": 42');
  });
});
