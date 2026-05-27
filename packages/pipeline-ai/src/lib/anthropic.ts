import type Anthropic from "@anthropic-ai/sdk";

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
  maxTokens: number;
  temperature: number;
};

export const getAnthropicText = (message: Anthropic.Messages.Message): string => {
  return message.content
    .map((block: Anthropic.Messages.ContentBlock) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
};

export const getAnthropicUserPrompts = (
  messages: Anthropic.Messages.MessageParam[]
): string[] => {
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

export const createAnthropicAiText = async (options: AnthropicTextOptions): Promise<string> => {
  const response = await options.client.messages.create({
    model: options.model,
    system: options.system,
    messages: options.messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  });

  const text = getAnthropicText(response);
  if (!text) {
    throw new Error(`Anthropic response for model ${options.model} is empty.`);
  }
  return text;
};
