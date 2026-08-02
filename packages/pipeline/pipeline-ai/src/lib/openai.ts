/*
<MODULE_CONTRACT>
<purpose>Facilitates interaction with OpenAI models by generating text, vision, and image responses based on specified options.</purpose>
<non-goals>
  <item>Does not handle authentication or API key management for OpenAI services.</item>
  <item>Does not provide a user interface for interacting with OpenAI models.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of OpenAI client interaction functions.</item>
  <item>Added optional logger parameter to OpenAiTextOptions and OpenAiVisionTextOptions for built-in AI call logging.</item>
  <item>Moved logging logic from pipeline-node/ai-helpers into provider implementation.</item>
  <item>Extracted withLlmLogging, getErrorMessage, and logAiError into shared logging.ts to eliminate triplication.</item>
  <item>Added optional attachments field to OpenAiTextOptions for multimodal image input via image_url content parts.</item>
  <item>Fixed multi-image GPT-5 routing: single image uses createOpenAiVisionText, multiple images fall through to chat.completions with image_url content parts.</item>
  <item>Added optional plugins field to OpenAiTextOptions for OpenRouter web search plugin pass-through (exa, parallel, native).</item>
  <item>Extract and append Perplexity/OpenRouter citation URLs from API response metadata (top-level citations array or message annotations) to saved response text.</item>
</CHANGE_SUMMARY>
*/

import {
  DEFAULT_EMPTY_USER_PROMPT,
  type PipelineAiLogOptions,
  type TokenUsage,
} from "@syrokomskyi/pipeline-core";

import { parseAiJson } from "./normalize-ai-json.js";
import { runWithOptionalLogging, type LlmRunResult } from "./logging.js";
import type { AiLogger } from "./types.js";

type OpenAiMessageContentPart = {
  type?: string;
  text?: string | null;
};

type OpenAiResponsesOutputPart = {
  type?: string;
  text?: string | null;
  content?: Array<{
    type?: string;
    text?: string | null;
  }>;
};

type OpenAiTextMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiVisionMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      >;
    };

type OpenAiTextResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<OpenAiMessageContentPart> | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string | null;
  }>;
};

type OpenAiResponsesTextResponse = {
  output_text?: string | null;
  output?: OpenAiResponsesOutputPart[];
  status?: string | null;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  error?: {
    message?: string | null;
  } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

const extractOpenAiText = (
  content: string | Array<OpenAiMessageContentPart> | null | undefined,
): string => {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }

      return "";
    })
    .join("")
    .trim();
};

const extractResponsesText = (response: OpenAiResponsesTextResponse): string => {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output ?? [])
    .map((item) => {
      if (typeof item.text === "string") {
        return item.text;
      }

      if (!Array.isArray(item.content)) {
        return "";
      }

      return item.content.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    })
    .join("")
    .trim();
};

const extractChatUsage = (response: OpenAiTextResponse): TokenUsage | undefined => {
  const u = response.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
};

const extractResponsesUsage = (response: OpenAiResponsesTextResponse): TokenUsage | undefined => {
  const u = response.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.input_tokens ?? 0,
    completionTokens: u.output_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
};

const extractResponseCitations = (response: Record<string, unknown>): string[] => {
  const urls = new Set<string>();

  // Path 1: top-level citations array (Perplexity native API)
  const topLevelCitations = response.citations;
  if (Array.isArray(topLevelCitations)) {
    for (const c of topLevelCitations) {
      if (typeof c === "string" && c.startsWith("http")) {
        urls.add(c);
      }
    }
  }

  // Path 2: message annotations (OpenRouter compatibility path)
  const choices = response.choices;
  if (Array.isArray(choices)) {
    const annotations = (choices[0] as Record<string, unknown> | undefined)?.message;
    const messageAnnotations = annotations
      ? (annotations as Record<string, unknown>).annotations
      : undefined;
    if (Array.isArray(messageAnnotations)) {
      for (const ann of messageAnnotations) {
        const urlCitation = (ann as Record<string, unknown>)?.url_citation as
          Record<string, unknown> | undefined;
        const url = urlCitation?.url;
        if (typeof url === "string" && url.startsWith("http")) {
          urls.add(url);
        }
      }
    }
  }

  return [...urls];
};

const toOpenAiTextLogOptions = (options: OpenAiTextOptions): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText?.trim() ?? DEFAULT_EMPTY_USER_PROMPT],
    images: options.attachments?.map((att) => Buffer.from(att.bytes)) ?? [],
    llm: {
      provider: "openai",
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

const toOpenAiVisionLogOptions = (options: OpenAiVisionTextOptions): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText],
    images: [Buffer.from(options.imageBytes)],
    llm: {
      provider: "openai",
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

export type OpenAiClientLike = {
  chat: {
    completions: {
      create: (options: {
        model: string;
        messages: OpenAiTextMessage[] | OpenAiVisionMessage[];
        max_tokens?: number;
        temperature?: number;
        plugins?: AiPlugin[];
      }) => Promise<OpenAiTextResponse>;
    };
  };
  responses?: {
    create: (options: {
      model: string;
      instructions: string;
      input: string;
      max_output_tokens?: number;
      temperature?: number;
    }) => Promise<OpenAiResponsesTextResponse>;
  };
  images: {
    generate: (options: {
      model: string;
      prompt: string;
      size: "1536x1024";
      quality: "medium";
      moderation: "low";
      output_format: "webp";
      output_compression: number;
    }) => Promise<OpenAiImageResponse>;
  };
};

export type AiAttachment = {
  bytes: Uint8Array;
  mimeType: string;
};

export type AiPlugin = { id: string; max_results?: number } | string;

export type OpenAiTextOptions = {
  client: OpenAiClientLike;
  model: string;
  system: string;
  userText?: string;
  attachments?: AiAttachment[];
  maxTokens?: number;
  temperature?: number;
  plugins?: AiPlugin[];
  logger?: AiLogger;
};

export type OpenAiVisionTextOptions = {
  client: OpenAiClientLike;
  model: string;
  system: string;
  userText: string;
  imageBytes: Uint8Array;
  imageMimeType: string;
  maxTokens?: number;
  temperature?: number;
  logger?: AiLogger;
};

export type OpenAiImageWebpOptions = {
  client: OpenAiClientLike;
  model: string;
  prompt: string;
};

export const createOpenAiText = async (options: OpenAiTextOptions): Promise<string> => {
  const userText = options.userText?.trim() || DEFAULT_EMPTY_USER_PROMPT;
  const isGpt5Model = options.model.startsWith("gpt-5");
  const hasAttachments = (options.attachments?.length ?? 0) > 0;

  if (isGpt5Model && hasAttachments && options.attachments!.length === 1) {
    return createOpenAiVisionText({
      client: options.client,
      model: options.model,
      system: options.system,
      userText,
      imageBytes: options.attachments![0].bytes,
      imageMimeType: options.attachments![0].mimeType,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      logger: options.logger,
    });
  }

  const runWithoutLogging = async (): Promise<LlmRunResult<string>> => {
    if (isGpt5Model && !hasAttachments) {
      if (!options.client.responses?.create) {
        throw new Error(
          `OpenAI client does not support responses.create for model ${options.model}.`,
        );
      }

      const response = await options.client.responses.create({
        model: options.model,
        instructions: options.system,
        input: userText,
        ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

      const text = extractResponsesText(response);
      if (!text) {
        const suffix = response.error?.message
          ? ` Error: ${response.error.message}`
          : response.incomplete_details?.reason
            ? ` Incomplete reason: ${response.incomplete_details.reason}`
            : response.status
              ? ` Status: ${response.status}`
              : "";
        throw new Error(`OpenAI response for model ${options.model} is empty.${suffix}`);
      }

      return { result: text, usage: extractResponsesUsage(response) };
    }

    const messages: OpenAiTextMessage[] | OpenAiVisionMessage[] = hasAttachments
      ? [
          { role: "system", content: options.system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...options.attachments!.map((att) => ({
                type: "image_url" as const,
                image_url: {
                  url: `data:${att.mimeType};base64,${Buffer.from(att.bytes).toString("base64")}`,
                },
              })),
            ],
          },
        ]
      : [
          { role: "system", content: options.system },
          { role: "user", content: userText },
        ];

    const response = await options.client.chat.completions.create({
      model: options.model,
      messages,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.plugins ? { plugins: options.plugins } : {}),
    });

    const text = extractOpenAiText(response.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error(`OpenAI response for model ${options.model} is empty.`);
    }

    const citations = extractResponseCitations(response as unknown as Record<string, unknown>);
    const result =
      citations.length > 0
        ? `${text}\n\n---\n## Citations\n${citations.map((url) => `- ${url}`).join("\n")}\n`
        : text;

    return { result, usage: extractChatUsage(response) };
  };

  return runWithOptionalLogging({
    operation: "createOpenAiText",
    logger: options.logger,
    logOptions: toOpenAiTextLogOptions(options),
    run: runWithoutLogging,
  });
};

export const createOpenAiJson = async <T>(options: OpenAiTextOptions): Promise<T> => {
  const text = await createOpenAiText(options);
  return parseAiJson<T>(text);
};

export const createOpenAiVisionText = async (options: OpenAiVisionTextOptions): Promise<string> => {
  const base64 = Buffer.from(options.imageBytes).toString("base64");
  const dataUrl = `data:${options.imageMimeType};base64,${base64}`;

  const runWithoutLogging = async (): Promise<LlmRunResult<string>> => {
    const completionTokens = options.model.startsWith("gpt-5")
      ? "max_completion_tokens"
      : "max_tokens";
    const supportedTemperature = options.model.startsWith("gpt-5") ? 1 : options.temperature;
    const response = await options.client.chat.completions.create({
      model: options.model,
      messages: [
        {
          role: "system",
          content: options.system,
        },
        {
          role: "user",
          content: [
            { type: "text", text: options.userText },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      ...(options.maxTokens ? { [completionTokens]: options.maxTokens } : {}),
      ...(supportedTemperature !== undefined ? { temperature: supportedTemperature } : {}),
    });

    const text = extractOpenAiText(response.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error(`OpenAI vision response for model ${options.model} is empty.`);
    }

    return { result: text, usage: extractChatUsage(response) };
  };

  return runWithOptionalLogging({
    operation: "createOpenAiVisionText",
    logger: options.logger,
    logOptions: toOpenAiVisionLogOptions(options),
    run: runWithoutLogging,
  });
};

export const createOpenAiImageWebp = async (
  options: OpenAiImageWebpOptions,
): Promise<Uint8Array> => {
  const response = await options.client.images.generate({
    model: options.model,
    prompt: options.prompt,
    size: "1536x1024",
    quality: "medium",
    moderation: "low",
    output_format: "webp",
    output_compression: 100,
  });

  const b64 = response.data?.[0]?.b64_json ?? "";
  if (!b64) {
    throw new Error(`OpenAI image response for model ${options.model} is empty.`);
  }

  return new Uint8Array(Buffer.from(b64, "base64"));
};
