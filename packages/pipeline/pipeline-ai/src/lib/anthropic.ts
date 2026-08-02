/*
<MODULE_CONTRACT>
<purpose>Facilitates interaction with Anthropic AI by managing message creation and extracting text content.</purpose>
<non-goals>
  <item>Does not handle authentication or API key management for Anthropic services.</item>
  <item>Does not provide a user interface for interacting with Anthropic AI.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for managing Anthropic AI message creation and text extraction.</item>
  <item>Added optional logger parameter to AnthropicTextOptions for built-in AI call logging.</item>
  <item>Moved logging logic from pipeline-node/ai-helpers into provider implementation.</item>
  <item>Extracted withLlmLogging, getErrorMessage, and logAiError into shared logging.ts to eliminate triplication.</item>
  <item>Added optional attachments field to AnthropicTextOptions for multimodal image input via content blocks.</item>
</CHANGE_SUMMARY>
*/

import type Anthropic from "@anthropic-ai/sdk";
import { type PipelineAiLogOptions, type TokenUsage } from "@syrokomskyi/pipeline-core";
import { runWithOptionalLogging, type LlmRunResult } from "./logging.js";
import type { AiAttachment } from "./openai.js";
import type { AiLogger } from "./types.js";

type AnthropicCreateParams = {
  model: string;
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  max_tokens: number;
  temperature: number;
};

export type AnthropicClient = {
  messages: {
    create: (params: AnthropicCreateParams) => Promise<Anthropic.Messages.Message>;
  };
};

export type AnthropicTextOptions = {
  client: AnthropicClient;
  model: string;
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  attachments?: AiAttachment[];
  maxTokens: number;
  temperature?: number;
  logger?: AiLogger;
};

export const getAnthropicText = (message: Anthropic.Messages.Message): string => {
  return message.content
    .map((block: Anthropic.Messages.ContentBlock) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
};

export const getAnthropicUserPrompts = (messages: Anthropic.Messages.MessageParam[]): string[] => {
  const list: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user") {
      continue;
    }

    const content = msg.content;
    if (typeof content === "string") {
      list.push(content);
      continue;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      list.push(text);
      continue;
    }

    if (content === null || content === undefined) {
      list.push("");
      continue;
    }

    list.push(String(content));
  }

  return list;
};

const toAnthropicLogOptions = (options: AnthropicTextOptions): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: getAnthropicUserPrompts(options.messages),
    images: options.attachments?.map((att) => Buffer.from(att.bytes)) ?? [],
    llm: {
      provider: "anthropic",
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

const extractAnthropicUsage = (message: Anthropic.Messages.Message): TokenUsage | undefined => {
  const u = message.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.input_tokens ?? 0,
    completionTokens: u.output_tokens ?? 0,
    totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
  };
};

const buildAnthropicMessages = (
  options: AnthropicTextOptions,
): Anthropic.Messages.MessageParam[] => {
  const hasAttachments = (options.attachments?.length ?? 0) > 0;
  if (!hasAttachments) {
    return options.messages;
  }

  const imageBlocks: Anthropic.Messages.ContentBlockParam[] = options.attachments!.map((att) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: Buffer.from(att.bytes).toString("base64"),
    },
  }));

  const lastUserIdx = [...options.messages].reverse().findIndex((m) => m.role === "user");
  if (lastUserIdx === -1) {
    return [...options.messages, { role: "user", content: [...imageBlocks] }];
  }

  const actualIdx = options.messages.length - 1 - lastUserIdx;
  const lastUser = options.messages[actualIdx];
  const existingContent =
    typeof lastUser.content === "string"
      ? [{ type: "text" as const, text: lastUser.content }]
      : Array.isArray(lastUser.content)
        ? lastUser.content
        : [];

  const newMessages = [...options.messages];
  newMessages[actualIdx] = {
    role: "user",
    content: [...existingContent, ...imageBlocks],
  };
  return newMessages;
};

export const createAnthropicAiText = async (options: AnthropicTextOptions): Promise<string> => {
  const runWithoutLogging = async (): Promise<LlmRunResult<string>> => {
    const params: AnthropicCreateParams = {
      model: options.model,
      system: options.system,
      messages: buildAnthropicMessages(options),
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 1,
    };
    if (options.temperature === undefined) {
      delete (params as Record<string, unknown>).temperature;
    }
    const response = await options.client.messages.create(params);

    const text = getAnthropicText(response);
    if (!text) {
      throw new Error(`Anthropic response for model ${options.model} is empty.`);
    }
    return { result: text, usage: extractAnthropicUsage(response) };
  };

  return runWithOptionalLogging({
    operation: "createAnthropicAiText",
    logger: options.logger,
    logOptions: toAnthropicLogOptions(options),
    run: runWithoutLogging,
  });
};
