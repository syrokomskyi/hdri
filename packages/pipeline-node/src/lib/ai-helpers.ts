import { DEFAULT_EMPTY_USER_PROMPT } from '@org/pipeline-core';
import type { PipelineAiLogOptions } from '@org/pipeline-core';
import {
  createAnthropicAiText,
  createPerplexityText,
  getAnthropicUserPrompts,
  type AnthropicTextOptions,
  type PerplexityTextOptions,
} from '@org/pipeline-ai';
import {
  createOpenAiJson,
  createOpenAiText,
  createOpenAiVisionText,
  type OpenAiTextOptions,
  type OpenAiVisionTextOptions,
} from '@org/pipeline-ai/openai';

type LoggedStepEvent = {
  event: string;
  status?: string;
  operation?: string;
  provider?: string;
  model?: string;
  details?: Record<string, unknown>;
};

export type CreateLoggedAiHelpersOptions = {
  logAiCall: (options: PipelineAiLogOptions) => Promise<string | null>;
  writeAiResponses: (
    callDir: string | null,
    responses: PipelineAiLogOptions['responses']
  ) => Promise<void>;
  logStepEvent?: (event: LoggedStepEvent) => Promise<void>;
};

type LoggedLlm = NonNullable<PipelineAiLogOptions['llm']>;

const requireLlmMetadata = (logOptions: PipelineAiLogOptions): LoggedLlm => {
  if (!logOptions.llm) {
    throw new Error('Logged AI helpers require llm metadata.');
  }

  return logOptions.llm;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const logAiError = (options: {
  provider: string;
  model: string;
  operation: string;
  error: unknown;
}): void => {
  console.error(
    `[AI:${options.provider}] ${options.operation} failed for ${options.model}: ${getErrorMessage(options.error)}`,
  );
};

const withLlmLogging = async <T>(options: {
  operation: string;
  llm: LoggedLlm;
  logAiCall: () => Promise<string | null>;
  writeAiResponses: (callDir: string | null, result: T) => Promise<void>;
  logStepEvent?: CreateLoggedAiHelpersOptions['logStepEvent'];
  run: () => Promise<T>;
}): Promise<T> => {
  try {
    await options.logStepEvent?.({
      event: 'llm_call_started',
      status: 'running',
      operation: options.operation,
      provider: options.llm.provider,
      model: options.llm.model,
      details: options.llm.parameters,
    });

    const callDir = await options.logAiCall();
    const result = await options.run();
    await options.writeAiResponses(callDir, result);

    await options.logStepEvent?.({
      event: 'llm_call_finished',
      status: 'completed',
      operation: options.operation,
      provider: options.llm.provider,
      model: options.llm.model,
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

const toOpenAiTextLogOptions = (
  options: OpenAiTextOptions,
): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText?.trim() ?? DEFAULT_EMPTY_USER_PROMPT],
    llm: {
      provider: 'openai',
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

const toOpenAiVisionLogOptions = (
  options: OpenAiVisionTextOptions,
): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText],
    images: [Buffer.from(options.imageBytes)],
    llm: {
      provider: 'openai',
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

const toAnthropicLogOptions = (
  options: AnthropicTextOptions,
): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: getAnthropicUserPrompts(options.messages),
    llm: {
      provider: 'anthropic',
      model: options.model,
      parameters: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    },
  };
};

const toPerplexityLogOptions = (
  options: PerplexityTextOptions,
): PipelineAiLogOptions => {
  return {
    system: options.system,
    userPrompts: [options.userText?.trim() ?? DEFAULT_EMPTY_USER_PROMPT],
    llm: {
      provider: 'perplexity',
      model: options.model,
    },
  };
};

export type LoggedOpenAiHelpers = {
  createOpenAiJson: <T>(callOptions: OpenAiTextOptions) => Promise<T>;
  createOpenAiText: (callOptions: OpenAiTextOptions) => Promise<string>;
  createOpenAiVisionText: (callOptions: OpenAiVisionTextOptions) => Promise<string>;
};

export type LoggedAnthropicHelpers = {
  createAnthropicAiText: (callOptions: AnthropicTextOptions) => Promise<string>;
};

export type LoggedPerplexityHelpers = {
  createPerplexityText: (callOptions: PerplexityTextOptions) => Promise<string>;
};

export const createLoggedOpenAiHelpers = (
  options: CreateLoggedAiHelpersOptions,
): LoggedOpenAiHelpers => {
  return {
    createOpenAiJson: async <T>(callOptions: OpenAiTextOptions): Promise<T> => {
      const logOptions = toOpenAiTextLogOptions(callOptions);
      const llm = requireLlmMetadata(logOptions);
      return withLlmLogging({
        operation: 'createOpenAiJson',
        llm,
        logAiCall: async () => {
          return options.logAiCall(logOptions);
        },
        writeAiResponses: async (callDir, result) => {
          await options.writeAiResponses(callDir, [{ content: JSON.stringify(result, null, 2) }]);
        },
        logStepEvent: options.logStepEvent,
        run: async () => createOpenAiJson<T>(callOptions),
      });
    },
    createOpenAiText: async (callOptions: OpenAiTextOptions): Promise<string> => {
      const logOptions = toOpenAiTextLogOptions(callOptions);
      const llm = requireLlmMetadata(logOptions);
      return withLlmLogging({
        operation: 'createOpenAiText',
        llm,
        logAiCall: async () => {
          return options.logAiCall(logOptions);
        },
        writeAiResponses: async (callDir, result) => {
          await options.writeAiResponses(callDir, [{ content: result }]);
        },
        logStepEvent: options.logStepEvent,
        run: async () => createOpenAiText(callOptions),
      });
    },
    createOpenAiVisionText: async (
      callOptions: OpenAiVisionTextOptions,
    ): Promise<string> => {
      const logOptions = toOpenAiVisionLogOptions(callOptions);
      const llm = requireLlmMetadata(logOptions);
      return withLlmLogging({
        operation: 'createOpenAiVisionText',
        llm,
        logAiCall: async () => {
          return options.logAiCall(logOptions);
        },
        writeAiResponses: async (callDir, result) => {
          await options.writeAiResponses(callDir, [{ content: result }]);
        },
        logStepEvent: options.logStepEvent,
        run: async () => createOpenAiVisionText(callOptions),
      });
    },
  };
};

export const createLoggedAnthropicHelpers = (
  options: CreateLoggedAiHelpersOptions,
): LoggedAnthropicHelpers => {
  return {
    createAnthropicAiText: async (
      callOptions: AnthropicTextOptions,
    ): Promise<string> => {
      const logOptions = toAnthropicLogOptions(callOptions);
      const llm = requireLlmMetadata(logOptions);
      return withLlmLogging({
        operation: 'createAnthropicAiText',
        llm,
        logAiCall: async () => {
          return options.logAiCall(logOptions);
        },
        writeAiResponses: async (callDir, result) => {
          await options.writeAiResponses(callDir, [{ content: result }]);
        },
        logStepEvent: options.logStepEvent,
        run: async () => createAnthropicAiText(callOptions),
      });
    },
  };
};

export const createLoggedPerplexityHelpers = (
  options: CreateLoggedAiHelpersOptions,
): LoggedPerplexityHelpers => {
  return {
    createPerplexityText: async (
      callOptions: PerplexityTextOptions,
    ): Promise<string> => {
      const logOptions = toPerplexityLogOptions(callOptions);
      const llm = requireLlmMetadata(logOptions);
      return withLlmLogging({
        operation: 'createPerplexityText',
        llm,
        logAiCall: async () => {
          return options.logAiCall(logOptions);
        },
        writeAiResponses: async (callDir, result) => {
          await options.writeAiResponses(callDir, [{ content: result }]);
        },
        logStepEvent: options.logStepEvent,
        run: async () => createPerplexityText(callOptions),
      });
    },
  };
};

export type {
  AnthropicTextOptions,
  OpenAiTextOptions,
  OpenAiVisionTextOptions,
  PerplexityTextOptions,
};
