/*
<MODULE_CONTRACT>
<purpose>Shared LLM logging helpers used by all AI provider implementations.</purpose>
<non-goals>
  <item>Does not implement provider-specific call logic or response parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted withLlmLogging, getErrorMessage, and logAiError from openai.ts, anthropic.ts, and perplexity.ts to eliminate triplication.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineAiLogOptions, TokenUsage } from "@syrokomskyi/pipeline-core";

import type { AiLogger } from "./types.js";

export type LlmRunResult<T> = { result: T; usage?: TokenUsage };

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const logAiError = (options: {
  provider: string;
  model: string;
  operation: string;
  error: unknown;
}): void => {
  console.error(
    `[AI:${options.provider}] ${options.operation} failed for ${options.model}: ${getErrorMessage(options.error)}`,
  );
};

export const withLlmLogging = async <T>(options: {
  operation: string;
  llm: NonNullable<PipelineAiLogOptions["llm"]>;
  logger: AiLogger;
  logOptions: PipelineAiLogOptions;
  run: () => Promise<LlmRunResult<T>>;
}): Promise<T> => {
  try {
    await options.logger.logStepEvent?.({
      event: "llm_call_started",
      status: "running",
      operation: options.operation,
      provider: options.llm.provider,
      model: options.llm.model,
      details: options.llm.parameters,
    });

    const callDir = await options.logger.logCall(options.logOptions);
    const { result, usage } = await options.run();
    await options.logger.writeResponse(callDir, [
      { content: typeof result === "string" ? result : JSON.stringify(result, null, 2) },
    ]);

    if (usage && options.logger.writeUsage) {
      await options.logger.writeUsage(callDir, usage);
    }

    await options.logger.logStepEvent?.({
      event: "llm_call_finished",
      status: "completed",
      operation: options.operation,
      provider: options.llm.provider,
      model: options.llm.model,
      details: usage,
    });

    return result;
  } catch (error) {
    logAiError({
      provider: options.llm.provider,
      model: options.llm.model,
      operation: options.operation,
      error,
    });
    throw error;
  }
};

/**
 * Run an LLM call with optional logging.
 * When no logger is provided, runs the call directly and returns the result.
 * When a logger is provided, wraps the call with withLlmLogging.
 */
export const runWithOptionalLogging = async <T>(options: {
  operation: string;
  logger?: AiLogger;
  logOptions: PipelineAiLogOptions;
  run: () => Promise<LlmRunResult<T>>;
}): Promise<T> => {
  if (!options.logger) {
    return options.run().then((r) => r.result);
  }

  const llm = options.logOptions.llm;
  if (!llm) {
    throw new Error("Logger provided but LLM metadata is missing");
  }

  return withLlmLogging({
    operation: options.operation,
    llm,
    logger: options.logger,
    logOptions: options.logOptions,
    run: options.run,
  });
};
