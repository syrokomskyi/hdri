/*
<MODULE_CONTRACT>
<purpose>Generates text using a specified AI model by sending system and user prompts to the OpenAI chat API.</purpose>
<non-goals>
  <item>Does not handle multiple AI models simultaneously.</item>
  <item>Does not provide caching for AI responses.</item>
  <item>Does not validate the AI model's output content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of text generation using OpenAI's chat API.</item>
  <item>Added optional logger parameter to PerplexityTextOptions for built-in AI call logging.</item>
  <item>Moved logging logic from pipeline-node/ai-helpers into provider implementation.</item>
  <item>Extracted withLlmLogging, getErrorMessage, and logAiError into shared logging.ts to eliminate triplication.</item>
</CHANGE_SUMMARY>
*/

import type OpenAI from "openai";
import {
  DEFAULT_EMPTY_USER_PROMPT,
  type PipelineAiLogOptions,
  type TokenUsage,
} from "@syrokomskyi/pipeline-core";
import { runWithOptionalLogging, type LlmRunResult } from "./logging.js";
import type { AiLogger } from "./types.js";

export type PerplexityClient = Pick<OpenAI, "chat">;

export type PerplexityTextOptions = {
  client: PerplexityClient;
  model: string;
  system: string;
  userText?: string;
  logger?: AiLogger;
};

const toPerplexityLogOptions = (options: PerplexityTextOptions): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText?.trim() ?? DEFAULT_EMPTY_USER_PROMPT],
    llm: {
      provider: "perplexity",
      model: options.model,
    },
  };
};

export const createPerplexityText = async (options: PerplexityTextOptions): Promise<string> => {
  const runWithoutLogging = async (): Promise<LlmRunResult<string>> => {
    const userText = options.userText?.trim() || DEFAULT_EMPTY_USER_PROMPT;
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: options.system },
      { role: "user", content: userText },
    ];

    const response = await options.client.chat.completions.create({
      model: options.model,
      messages,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new Error(`Perplexity response for model ${options.model} is empty.`);
    }
    const u = response.usage;
    const usage: TokenUsage | undefined = u
      ? {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          totalTokens: u.total_tokens ?? 0,
        }
      : undefined;
    return { result: text, usage };
  };

  return runWithOptionalLogging({
    operation: "createPerplexityText",
    logger: options.logger,
    logOptions: toPerplexityLogOptions(options),
    run: runWithoutLogging,
  });
};
